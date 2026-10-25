# Put the website online

GitHub stores the project code. Railway runs the Node.js server, publishes the
website, and keeps enquiry and order records on persistent storage. GitHub
Pages alone cannot run this website's forms or admin backend.

You will need your own GitHub and Railway accounts. Railway may ask you to
choose a paid plan; check its current pricing before confirming any payment.

## 1. Make a private GitHub repository

1. Sign in at [github.com](https://github.com/).
2. Create a new repository called `pooja-mam-web`.
3. Choose **Private**, then create the repository.
4. On your computer, open the project folder in Finder:
   `Desktop` → `Pooja mam web`.
5. In the new GitHub repository, choose **Add file** → **Upload files**.
6. Upload the website files listed below, keeping the `images` folder in place.
   Do not upload `data`, `.env`, the extra `IMG_20261026_004103.jpg` file, or
   `Attached Element Context from Integrated`.
7. Choose **Commit changes** to save the upload.
8. Choose **Add file** → **Create new file**, name it `.gitignore`, and paste:

   ```gitignore
   .env
   .env.*
   data/
   .DS_Store
   /IMG_20261026_004103.jpg
   /Attached Element Context from Integrated
   ```

   Commit the new file. This protects private settings and customer records if
   the project is later updated using Git.

Upload these project files and folders:

- `admin.html`, `admin.js`
- `index.html`
- `package.json`, `package-lock.json`
- `railway.json`
- `script.js`, `server.js`, `style.css`
- `images/` (the three images used by the website)
- `BACKEND_SETUP.md`, `DEPLOYMENT.md`

Keep the repository private. The deployed website and its pictures will still
be visible to visitors; only the source repository is private.

## 2. Deploy from GitHub to Railway

1. Sign in at [railway.com](https://railway.com/) and choose a new project
   deployed from a GitHub repository.
2. Connect your GitHub account when Railway asks, and select the
   `pooja-mam-web` private repository.
3. Railway detects `package.json` and starts the app with `npm start`. Wait for
   the first deployment to finish.
4. In the Railway service settings, add a **Volume** mounted at `/data`.
5. In the service's **Variables**, add the following variables:

   | Variable | Value |
   | --- | --- |
   | `ADMIN_PASSWORD` | A new, private password at least 14 characters long |
   | `DATA_DIR` | `/data` |
   | `NODE_ENV` | `production` |

   Do not reuse a password you shared in chat. Enter the password only in
   Railway's private Variables settings. Do not add `PORT`; Railway provides it.
6. Save the variables and wait for Railway to redeploy the service with the
   volume attached.
7. In the service's **Networking** settings, create a public domain.
8. Open the new HTTPS domain. The public website is at the domain root; the
   admin dashboard is at `/admin`, for example `https://your-domain/admin`.
9. Sign in with the `ADMIN_PASSWORD` you saved in Railway. Submit a test
   consultation request and check that it appears in the dashboard.

The volume at `/data` holds customer requests between deployments. Without the
volume, saved records may be lost when Railway replaces the app. Back up
customer records securely and limit access to the admin password.

## Before sharing the public site

The public forms collect names, phone numbers, email addresses, messages, and
delivery addresses. Add a clear privacy notice explaining how this information
is used, who can access it, and how someone can request its deletion. Do not
collect customer details you do not need.

Order requests are not paid online. The dashboard marks them unpaid; confirm
payment and delivery with the customer separately. Online payment integration
is a separate task.
