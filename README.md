# AZ Social — Facebook-style social website starter

A responsive starter project built with HTML, CSS, JavaScript modules and Firebase.

## Included in Version 1
- Email/password sign-up and login
- User profile basics
- Create text posts and image posts
- Real-time news feed
- Like/unlike posts
- Real-time comments
- Responsive desktop and mobile layout

## 1. Create a Firebase project
1. Open https://console.firebase.google.com/ and create a project (for example `az-social`).
2. Add a **Web app** from Project Overview.
3. Copy the Firebase configuration object.
4. Open `firebase.js` and replace all `PASTE_...` placeholder values with your project's values.

## 2. Enable Firebase services
In Firebase Console:
- Authentication → Get started → Sign-in method → enable **Email/Password**.
- Firestore Database → Create database.
- Storage → Get started.

## 3. Firestore security rules
Open Firestore Database → Rules and publish:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    match /users/{userId} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == userId;
      allow update: if signedIn() && request.auth.uid == userId;
    }

    match /posts/{postId} {
      allow read: if signedIn();
      allow create: if signedIn()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.text is string
        && request.resource.data.text.size() <= 2000;
      allow update: if signedIn()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likeCount'])
        && request.resource.data.likeCount is int
        && request.resource.data.likeCount >= 0;
      allow delete: if signedIn() && resource.data.uid == request.auth.uid;

      match /likes/{userId} {
        allow read: if signedIn();
        allow create, delete: if signedIn() && request.auth.uid == userId;
      }

      match /comments/{commentId} {
        allow read: if signedIn();
        allow create: if signedIn()
          && request.resource.data.uid == request.auth.uid
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0
          && request.resource.data.text.size() <= 500;
        allow update, delete: if signedIn()
          && resource.data.uid == request.auth.uid;
      }
    }
  }
}
```

## 4. Firebase Storage rules
Open Storage → Rules and publish:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /postImages/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

## 5. Run the website
Do not open `index.html` by double-clicking it. Run it through a local web server:
- Install Visual Studio Code.
- Install the **Live Server** extension.
- Open this folder in VS Code.
- Right-click `index.html` → **Open with Live Server**.

Alternatively, from this folder run `python -m http.server 5500`, then visit `http://localhost:5500`.

## 6. Test
1. Create an account with an email you can access.
2. Log out and log back in.
3. Publish a text post.
4. Publish an image post under 5 MB.
5. Like a post and add a comment.
6. Open the site in another browser/private window and create a second test account to check the shared feed.

## Important notes
- This is a learning/MVP project, not a production-scale Facebook clone.
- Firebase web config is not a password; security depends on Authentication and correctly configured Security Rules. Never put service-account private keys in browser code.
- Before public launch, add email verification, password reset, profile editing, reporting/blocking, moderation, pagination, rate limiting, privacy controls and abuse protection.
- The current starter displays posts to signed-in users. It does not yet include friend requests, private messaging, notifications, admin dashboard or full profile pages.
- Firestore rules above allow a signed-in user to update the post's `likeCount`; for a production app, move like-count maintenance to trusted Cloud Functions to prevent tampering.
