import { auth, db, storage } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, doc, setDoc, addDoc, getDoc, onSnapshot, query,
  orderBy, serverTimestamp, updateDoc, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const $ = (id) => document.getElementById(id);
let authMode = "login";
let unsubscribeFeed = null;
let currentUser = null;

function showMessage(id, message, isError = true) {
  const el = $(id);
  el.textContent = message;
  el.style.color = isError ? "#b42318" : "#16834a";
}
function initials(name = "A") {
  return name.trim().charAt(0).toUpperCase() || "A";
}
function setMode(mode) {
  authMode = mode;
  $("login-tab").classList.toggle("active", mode === "login");
  $("signup-tab").classList.toggle("active", mode === "signup");
  $("name-wrap").classList.toggle("hidden", mode !== "signup");
  $("auth-submit").textContent = mode === "login" ? "Log in" : "Create account";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  showMessage("auth-message", "");
}
$("login-tab").addEventListener("click", () => setMode("login"));
$("signup-tab").addEventListener("click", () => setMode("signup"));

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const name = $("name").value.trim();
  const submit = $("auth-submit");
  submit.disabled = true;
  showMessage("auth-message", "");
  try {
    if (authMode === "signup") {
      if (!name) throw new Error("Please enter your name.");
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name });
      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid, name, email, createdAt: serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    showMessage("auth-message", friendlyError(error));
  } finally {
    submit.disabled = false;
  }
});

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "This email already has an account. Please log in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/network-request-failed": "Network error. Check your internet connection."
  };
  return messages[error.code] || error.message || "Something went wrong.";
}

$("logout-btn").addEventListener("click", () => signOut(auth));
$("post-image").addEventListener("change", () => {
  $("file-name").textContent = $("post-image").files[0]?.name || "No image selected";
});

$("post-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const text = $("post-text").value.trim();
  const imageFile = $("post-image").files[0];
  if (!text && !imageFile) {
    showMessage("post-message", "Write something or choose an image.");
    return;
  }
  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    showMessage("post-message", "Please choose an image smaller than 5 MB.");
    return;
  }
  const button = $("post-submit");
  button.disabled = true;
  showMessage("post-message", "Publishing...", false);
  try {
    let imageUrl = "";
    if (imageFile) {
      const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const imageRef = ref(storage, `postImages/${currentUser.uid}/${Date.now()}_${safeName}`);
      const uploaded = await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(uploaded.ref);
    }
    await addDoc(collection(db, "posts"), {
      uid: currentUser.uid,
      authorName: currentUser.displayName || "Member",
      text,
      imageUrl,
      createdAt: serverTimestamp(),
      likeCount: 0
    });
    $("post-text").value = "";
    $("post-image").value = "";
    $("file-name").textContent = "No image selected";
    showMessage("post-message", "Your post is published!", false);
  } catch (error) {
    showMessage("post-message", friendlyError(error));
  } finally {
    button.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  $("auth-panel").classList.toggle("hidden", !!user);
  $("app-panel").classList.toggle("hidden", !user);
  $("logout-btn").classList.toggle("hidden", !user);
  if (!user) {
    $("user-label").textContent = "Not signed in";
    $("feed").innerHTML = '<div class="empty-state">Log in to see the community feed.</div>';
    if (unsubscribeFeed) unsubscribeFeed();
    unsubscribeFeed = null;
    return;
  }
  const name = user.displayName || user.email || "Member";
  $("user-label").textContent = name;
  $("sidebar-name").textContent = name;
  $("sidebar-email").textContent = user.email || "";
  $("avatar-letter").textContent = initials(name);
  $("composer-avatar").textContent = initials(name);
  startFeed();
});

function startFeed() {
  if (unsubscribeFeed) unsubscribeFeed();
  const feedQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  unsubscribeFeed = onSnapshot(feedQuery, (snapshot) => {
    $("feed").innerHTML = "";
    if (snapshot.empty) {
      $("feed").innerHTML = '<div class="empty-state">No posts yet. Be the first to share something!</div>';
      return;
    }
    snapshot.forEach((postDoc) => renderPost(postDoc.id, postDoc.data()));
  }, (error) => {
    $("feed").innerHTML = `<div class="empty-state">Could not load feed: ${escapeHtml(error.message)}</div>`;
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}
function formatDate(timestamp) {
  if (!timestamp?.toDate) return "Just now";
  return timestamp.toDate().toLocaleString();
}

async function renderPost(postId, post) {
  const article = document.createElement("article");
  article.className = "post";
  const name = post.authorName || "Member";
  const image = post.imageUrl ? `<img class="post-image" src="${escapeHtml(post.imageUrl)}" alt="Post image" loading="lazy">` : "";
  article.innerHTML = `
    <div class="post-head">
      <div class="avatar">${escapeHtml(initials(name))}</div>
      <div><span class="post-author">${escapeHtml(name)}</span><span class="post-date">${escapeHtml(formatDate(post.createdAt))}</span></div>
    </div>
    ${post.text ? `<p class="post-text">${escapeHtml(post.text)}</p>` : ""}
    ${image}
    <div class="post-actions">
      <button class="action-btn like-btn" type="button">♡ Like · <span>${Number(post.likeCount || 0)}</span></button>
      <button class="action-btn comment-focus" type="button">Comment</button>
    </div>
    <div class="comment-list"></div>
    <form class="comment-form">
      <input type="text" maxlength="500" placeholder="Write a comment..." aria-label="Write a comment">
      <button type="submit">Send</button>
    </form>`;
  $("feed").appendChild(article);

  const likeButton = article.querySelector(".like-btn");
  const likeRef = doc(db, "posts", postId, "likes", currentUser.uid);
  try {
    const likeSnapshot = await getDoc(likeRef);
    if (likeSnapshot.exists()) likeButton.classList.add("liked");
  } catch (error) { console.error("Like status:", error); }

  likeButton.addEventListener("click", async () => {
    likeButton.disabled = true;
    try {
      await runTransaction(db, async (transaction) => {
        const postRef = doc(db, "posts", postId);
        const existingLike = await transaction.get(likeRef);
        if (existingLike.exists()) {
          transaction.delete(likeRef);
          transaction.update(postRef, { likeCount: increment(-1) });
        } else {
          transaction.set(likeRef, { uid: currentUser.uid, createdAt: serverTimestamp() });
          transaction.update(postRef, { likeCount: increment(1) });
        }
      });
    } catch (error) {
      alert("Could not update like: " + error.message);
    } finally { likeButton.disabled = false; }
  });

  article.querySelector(".comment-focus").addEventListener("click", () => article.querySelector(".comment-form input").focus());
  const commentList = article.querySelector(".comment-list");
  const commentsQuery = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
  onSnapshot(commentsQuery, (snapshot) => {
    commentList.innerHTML = "";
    snapshot.forEach((commentDoc) => {
      const comment = commentDoc.data();
      const row = document.createElement("div");
      row.className = "comment";
      row.innerHTML = `<strong>${escapeHtml(comment.authorName || "Member")}</strong>${escapeHtml(comment.text || "")}`;
      commentList.appendChild(row);
    });
  });

  article.querySelector(".comment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = article.querySelector(".comment-form input");
    const text = input.value.trim();
    if (!text) return;
    const sendButton = article.querySelector(".comment-form button");
    sendButton.disabled = true;
    try {
      await addDoc(collection(db, "posts", postId, "comments"), {
        uid: currentUser.uid,
        authorName: currentUser.displayName || "Member",
        text,
        createdAt: serverTimestamp()
      });
      input.value = "";
    } catch (error) {
      alert("Could not add comment: " + error.message);
    } finally { sendButton.disabled = false; }
  });
}
