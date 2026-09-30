# Environment setup

The managed WebDev project stores secrets through its environment configuration. For a local `.env`, use these variable names and keep the file out of version control:

```text
PORT=3000
DATABASE_URL=mysql://root:password@127.0.0.1:3306/neighbourhelp
SESSION_SECRET=replace-with-a-long-random-session-secret
JWT_SECRET=replace-with-a-long-random-jwt-secret

VITE_FIREBASE_API_KEY=your-firebase-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-firebase-app-id

FIREBASE_SERVICE_ACCOUNT_JSON={"projectId":"your-project-id","clientEmail":"firebase-adminsdk@example.iam.gserviceaccount.com","privateKey":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}

# Set one or both. Firebase custom claim admin=true/role=admin also authorizes an administrator.
ADMIN_FIREBASE_UIDS=your-firebase-admin-uid
ADMIN_FIREBASE_EMAILS=admin@example.com

# Optional local compatibility login. Defaults are admin / 25879899.
ADMIN_LEGACY_USERNAME=admin
ADMIN_LEGACY_PASSWORD=25879899
```

The `VITE_FIREBASE_*` values are Firebase Web App configuration values. `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_FIREBASE_UIDS`, `ADMIN_FIREBASE_EMAILS`, `ADMIN_LEGACY_USERNAME`, `ADMIN_LEGACY_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, and `JWT_SECRET` are server-side configuration values/secrets. The Firebase Admin private key must never be placed in frontend code. Firebase claims or a UID allowlist are preferred for production; the local compatibility login exists for this requested project workflow.
