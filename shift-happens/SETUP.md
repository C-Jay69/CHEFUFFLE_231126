# Whiteout setup guide

This is the walkthrough: from a fresh machine to a tablet on the floor, a
kitchen screen, and a live service. For the reference version — environment
variables, volumes, backups, security — see [DEPLOYMENT.md](DEPLOYMENT.md).

```
Tablet / KDS / phone
        │  Wi-Fi
        ▼
   router / switch ─── wired ───►  server
                                   ├── Caddy  :80/:443  (TLS + reverse proxy)
                                   ├── web    :3010    Next.js
                                   ├── api    :4000    Fastify + Socket.io
                                   └── db     :5432    PostgreSQL
```

The tablet is a browser. It talks to the server over HTTP and a WebSocket; there
is no pairing step. Printers are local to the tablet; payment terminals talk to
the processor, not to the server.

## 0. What you need

| Thing | Recommendation |
| --- | --- |
| Server | Ubuntu mini PC (Intel NUC / Beelink class), 4 cores, 8 GB RAM, 128 GB SSD, wired Ethernet, UPS |
| Tablets | iPad (current) or Samsung Galaxy Tab A9+/S9 FE; one per 3–4 servers |
| KDS screen | 22–32" commercial display (Samsung/LG/Elo) or a tablet in a fanless mount |
| Printer | Epson TM-m30III/TM-T88VII or Star TSP143IV/mC-Print3, 80mm ESC/POS |
| Cash drawer | APG or MMF, printer kick-out |
| Network | Wi-Fi access point near the floor; POS on its own SSID/VLAN; internet only if you use payments/Voice AI |
| Domain | Optional. A public domain gives automatic HTTPS; a LAN name works with Caddy's internal CA |

---

## Path A — 15-minute local walkthrough (laptop, one tablet)

Use this to try the product and test a tablet before installing a server.

### 1. Install the tools

- Node.js 22 and Corepack (`corepack enable`)
- pnpm 9+ (the repo pins the exact version in `package.json`)
- PostgreSQL 16 **or** Docker

```bash
node -v        # v22.x
pnpm -v
```

### 2. Get the code and install

```bash
git clone <your-repo> WHITEOUT_181126
cd WHITEOUT_181126/shift-happens
pnpm install
```

### 3. Configure

```bash
cp .env.example .env
```

At minimum, check:

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:5433/shift_happens?schema=public"
API_PORT=4000
NEXT_PUBLIC_API_URL="http://localhost:4000"
CORS_ORIGIN="http://localhost:3010"
RESTAURANT_ID="11111111-1111-4111-8111-111111111111"
```

### 4. Start the database and load the demo dataset

```bash
pnpm db:up      # repo-local PostgreSQL on :5433
pnpm db:push    # creates/updates the schema
pnpm db:seed    # wipes and reloads the demo restaurant
```

> `db:seed` is destructive. On a database with real data, skip it.

### 5. Run the app

```bash
pnpm dev
```

Open <http://localhost:3010> for the landing page, or straight to the app:

- <http://localhost:3010/setup> — diagnostics
- <http://localhost:3010/login> — PIN terminal (`1111` is the demo GM)
- <http://localhost:3010/serve> — floor service

### 6. Put a tablet on it

Find the laptop/server IP:

```bash
hostname -I
# e.g. 192.168.1.50
```

On the tablet, open `http://192.168.1.50:3010`. If the page loads but data does
not, the browser is trying `localhost:4000`. Fix it one of two ways:

**A. Runtime setting (no rebuild).** Add to `.env`:

```bash
PUBLIC_API_URL="http://192.168.1.50:4000"
CORS_ORIGIN="http://192.168.1.50:3010,http://localhost:3010"
```

Restart `pnpm dev`. `/config.js` hands that address to the browser at load time.

**B. Build-time setting.** Change `NEXT_PUBLIC_API_URL` to the same address and
restart (in production, rebuild). Runtime is preferable.

Then open `http://192.168.1.50:3010/setup` on the tablet and press **Run checks**.
You want API **Online**, Database **Connected**, Realtime **Connected**, Menu
**Loaded**. Fix anything red before moving on.

> On plain HTTP the app works but the PWA cannot install. That needs HTTPS —
> Path B.

---

## Path B — install a real server (recommended for one restaurant)

### 1. Prepare the machine

- Install Ubuntu Server 24.04 LTS; enable OpenSSH.
- Give it a **DHCP reservation** or static IP, e.g. `192.168.1.50`.
- Connect it by Ethernet to the router/switch. Put it and the Wi-Fi AP on a UPS.
- Set the timezone and make sure NTP is active (`timedatectl`).

### 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out and back in
docker --version
docker compose version
```

### 3. Get the code

```bash
git clone <your-repo> /opt/whiteout
cd /opt/whiteout/shift-happens/deploy
```

### 4. Choose how the site is addressed

**Public domain (automatic HTTPS, needed for Twilio/Voice AI):**

- Point `pos.example.com` (A record) at the server's public IP; forward ports
  80/443 on the router.
- Keep `deploy/Caddyfile`.

**LAN only (no internet needed):**

- Give the server a local name in your router/DNS, e.g. `whiteout.local`.
- Use `deploy/Caddyfile.lan` instead (it enables Caddy's internal CA):

```bash
cp Caddyfile.lan Caddyfile
```

- Tablets must trust Caddy's local root certificate. Copy it from the caddy
  volume and install it on each device:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./root.crt
```

(On iPad: AirDrop/email the `.crt`, install the profile, then enable full trust
under Settings → General → About → Certificate Trust Settings.)

### 5. Configure the deployment

```bash
cp .env.example .env
```

Edit `deploy/.env`:

```bash
SITE_ADDRESS=pos.example.com          # or https://whiteout.local
PUBLIC_ORIGIN=https://pos.example.com # or https://whiteout.local
PUBLIC_API_URL=same-origin            # Caddy proxies /api and /socket.io
POSTGRES_PASSWORD=<long hex random>    # openssl rand -hex 24
RESTAURANT_ID=11111111-1111-4111-8111-111111111111
```

Optional integrations (Twilio, Gemini, SendGrid, Stripe, Redis) can stay blank;
the app degrades gracefully.

### 6. Build and start

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

The API waits for Postgres, runs `prisma db push`, then starts. Caddy obtains a
certificate (public domain) or uses its internal CA (LAN file).

### 7. First data

A fresh database is empty. Either:

```bash
# demo dataset — WIPES the database
docker compose exec api pnpm --filter @shift-happens/db seed
```

or enter the app and add a restaurant/menu/staff through the UI. For a real
install, load the menu and floor plan before service.

### 8. Verify from the server and from a tablet

```bash
curl -s https://pos.example.com/api/health
```

Then open `https://pos.example.com/setup` on the tablet. All four checks should
be green. Open the terminal, sign in, and walk one table from seat to payment.

### 9. Install the PWA and lock the devices

- **iPad:** Safari → Share → Add to Home Screen. Settings → Accessibility →
  Guided Access → On. Set Auto-Lock to Never while on charge.
- **Android:** Chrome → Install app, or use Fully Kiosk Browser pointed at the
  URL. Lock task mode prevents leaving the app.
- **KDS:** open `/kds` in fullscreen on the kitchen display. A commercial
  display with a mini PC or Android stick is more reliable than a TV browser.
  Set the screen to wake on input and disable sleep.
- **Printer:** connect the receipt printer to the tablet (Bluetooth/USB) or to
  the LAN, then use **Test receipt** on `/setup` and choose it in the print
  dialog. Use 80mm paper and zero margins.

### 10. Keep it running

```bash
docker compose logs -f          # follow all services
docker compose restart api      # restart the API only
docker compose down             # stop everything (data stays in volumes)
```

Back up nightly (see DEPLOYMENT.md):

```bash
docker compose exec -T db pg_dump -U whiteout whiteout | gzip > backup-$(date +%F).sql.gz
```

---

## Path C — cloud server

Same compose file, no LAN assumptions:

1. Create an Ubuntu VPS (2 vCPU / 4 GB is enough for one restaurant).
2. Point a domain at it and open ports 80/443.
3. Follow Path B steps 2–7.
4. Tablets need internet. Latency to the cloud is usually fine; card terminals
   and Voice AI are cloud-native anyway.
5. For multi-site, run one stack per restaurant or move Postgres to a managed
   service and keep one web/API pair.

---

## First-shift checklist

- [ ] `/setup` green on every tablet
- [ ] Staff PINs changed from the demo values
- [ ] Restaurant name, address and phone correct
- [ ] Floor plan uploaded and tables placed
- [ ] Menu imported; modifiers and 86 items checked
- [ ] Printers tested on every terminal
- [ ] KDS station routing tested (fire a test ticket, bump it)
- [ ] End of Night: open a test check, pay it, count it, re-open it, void it
- [ ] Reservations: book, seat, cancel
- [ ] Backups scheduled
- [ ] UPS on server/router/AP

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Page loads, no data | API base points at `localhost` | Set `PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL`, restart |
| `/setup` API offline | API down, port closed, CORS | `docker compose logs api`; check `CORS_ORIGIN` includes the page origin |
| Realtime offline only | Proxy not forwarding `/socket.io` | Use the supplied Caddyfile; allow WebSocket upgrades |
| Database error | Postgres down or schema missing | `docker compose ps`; API runs `prisma db push` on boot |
| 502 from Caddy | web/api container crashed | `docker compose logs web api` |
| PWA won't install | plain HTTP | Put it behind HTTPS |
| Receipt prints blank | wrong printer or paper width | Print from `/setup`; choose 80mm, no scaling |
| Times/dates drift | NTP not running | `timedatectl set-ntp true` on server and devices |

## Security notes

- The PIN terminal is a demo gate. Change every seeded PIN and keep the app on
  the restaurant network; do not expose the API directly to the internet.
- Use a long `POSTGRES_PASSWORD`; never commit `deploy/.env`.
- Only Caddy should be public (80/443). Keep 3010/4000 internal.
- Restrict SSH to keys, enable automatic security updates.
- Back up Postgres and the `whiteout-uploads` volume; test a restore.
