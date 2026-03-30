# TDS Intelligence Platform — VPS Deployment Guide
## Complete setup for Ubuntu/Debian VPS with Nginx

---

## 1. Upload Files to VPS

```bash
# From your local machine — upload all files
scp -r tds-platform/ user@YOUR_VPS_IP:/var/www/tds-platform/

# Or use FileZilla / WinSCP for Windows
# Target folder on VPS: /var/www/tds-platform/
```

## 2. Install Nginx (if not installed)

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

## 3. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/tds-platform
```

Paste this config:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    root /var/www/tds-platform;
    index login.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript text/html;
    gzip_min_length 1000;

    location / {
        try_files $uri $uri/ /login.html;
        # Cache static assets
        location ~* \.(css|js)$ {
            expires 1d;
            add_header Cache-Control "public, immutable";
        }
    }

    # Redirect root to login
    location = / {
        return 302 /login.html;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/tds-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Set File Permissions

```bash
sudo chown -R www-data:www-data /var/www/tds-platform/
sudo chmod -R 755 /var/www/tds-platform/
```

## 5. SSL Certificate (HTTPS) — Recommended

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d YOUR_DOMAIN.com
# Follow prompts, auto-renews every 90 days
```

## 6. Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## File Structure on Server

```
/var/www/tds-platform/
├── login.html          ← Login page (entry point)
├── dashboard.html      ← Main dashboard
├── css/
│   └── dashboard.css   ← Dashboard styles
└── js/
    └── dashboard.js    ← All logic + API calls
```

---

## Default Login Credentials

| Username | Password   | Role          |
|----------|------------|---------------|
| admin    | admin@123  | Administrator |
| demo     | demo123    | Viewer        |

**IMPORTANT:** Change these in `login.html` before deploying to production!
Look for the `USERS` array in the `<script>` section.

---

## API Keys Configuration

After logging in, go to **Settings** tab and enter:
- **Anthropic API Key** — from https://console.anthropic.com
- **Perplexity API Key** — from https://perplexity.ai/settings/api

Keys are stored in the user's browser localStorage (not on your server).

---

## Updating the Platform

```bash
# Upload new files
scp -r tds-platform/ user@YOUR_VPS_IP:/var/www/

# Fix permissions
sudo chown -R www-data:www-data /var/www/tds-platform/
```

---

## Troubleshooting

**Page not loading:**
```bash
sudo nginx -t                    # Test config
sudo tail -f /var/log/nginx/error.log  # Check errors
```

**CORS errors on API calls:**
The app calls Anthropic and Perplexity APIs directly from the browser.
Both APIs support browser-side CORS calls — no backend needed.

**Data not persisting:**
Data is stored in browser localStorage. Each user's browser stores their own data.
For shared/server-side storage, a backend (Node.js + SQLite) would be needed.
