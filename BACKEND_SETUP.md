# Backend setup

This website has a Node.js backend for consultation enquiries, contact
messages, shop order requests, and the private admin dashboard. Online
payments are not enabled.

## Run locally

```sh
cd "/path/to/Pooja mam web"
ADMIN_PASSWORD='your-own-private-password-at-least-14-characters' npm start
```

Use your own private password; never share it in chat or save it in the project.
Open the website at `http://127.0.0.1:8000` and the admin page at
`http://127.0.0.1:8000/admin`. Stop the server with `Ctrl+C`.

## Saved data

Consultation requests, contact messages, and unpaid order requests are saved to
`data/records.json` locally. The `data` directory and environment files are
excluded from Git. Keep private records backed up securely.

## Deploy online

See [DEPLOYMENT.md](./DEPLOYMENT.md) for steps to put the website online using
a private GitHub repository and Railway hosting.
