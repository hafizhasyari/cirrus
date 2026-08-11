# PRD: Cloud VM Inventory Dashboard

| | |
|---|---|
| **Status** | Approved |
| **Owner** | Admin User |
| **Last updated** | 2026-08-08 |

## 1. Latar Belakang & Masalah

Saat ini VM tersebar di 5 cloud provider (AWS, GCP, Alibaba Cloud, OCI, Biznet Gio Cloud) dan tidak ada satu tempat untuk melihat inventory-nya secara terpusat. Untuk tahu "ada VM apa aja, di mana, statusnya gimana, dan berapa biayanya", tim harus login satu-satu ke console tiap provider. Ini lambat, gampang miss (ada VM nganggur tapi kebayar terus), dan menyulitkan audit lintas tim.

## 2. Tujuan (Goals)

- Satu dashboard web untuk melihat seluruh VM dari 5 cloud provider secara near real-time.
- Data ditarik langsung dari API provider (live pull), bukan disalin dan disimpan sebagai sumber kebenaran.
- Akses diatur berbasis role, terintegrasi dengan SSO perusahaan.
- Tim bisa filter/cari VM tanpa buka console masing-masing provider.

### Non-Goals (di luar scope MVP)

- Provisioning/manajemen VM (create/stop/delete) — ini read-only inventory, bukan control plane.
- **Cost/billing info** (estimasi biaya per VM, agregat per provider/akun/tim) — MVP pertama ini fokus murni ke inventory dulu; cost masuk fase berikutnya (lihat §10 untuk detail teknis yang sudah diriset).
- Cost *optimization* otomatis (rightsizing recommendation, auto-shutdown, dll).
- Alerting/notifikasi real-time (masuk backlog fase berikutnya, lihat §10).
- Multi-cloud resource lain (storage, network, database managed service) — fokus VM/compute dulu.

## 3. Target Pengguna & RBAC

Pengguna adalah beberapa tim internal dengan kebutuhan akses berbeda (bukan single user). Role diusulkan:

| Role | Access |
|---|---|
| **Admin** | Kelola user/role, kelola koneksi akun cloud (credentials), lihat semua data |
| **Viewer** | Lihat inventory untuk akun/project yang di-assign ke dia saja |

Autentikasi via **Microsoft 365 (Microsoft Entra ID / Azure AD)** menggunakan OIDC — Auth Service login lewat Microsoft identity platform (v2.0 endpoint), sign-in umum untuk seluruh perusahaan (multi-tenant tidak diperlukan, single-tenant Entra ID cukup). Role & assignment akun-ke-user tetap dikelola di dalam aplikasi (bukan di Entra ID/group-based), disimpan di database aplikasi — pakai `oid` + `tid` (bukan `email`) dari token Microsoft sebagai identitas user — `email`/UPN bisa reassign/berubah sehingga tidak boleh jadi identity key, hanya dipakai untuk display; request scope `profile` supaya claim `oid` muncul di token.

## 4. Scope MVP

### 4.1 Fitur inti
1. **Inventory list** — daftar semua VM lintas 5 provider dalam satu tabel: nama, provider, akun/project, region, status (running/stopped/terminated), instance type/size, IP, tags.
2. **Filter & search** — filter by provider, akun/project, region, status, tag; search by nama/ID instance.
3. **RBAC & SSO login** — sesuai §3.

### 4.2 Yang disederhanakan dulu di MVP
- **Cost/billing info tidak masuk MVP pertama ini** — lihat §10 Roadmap untuk detail cost per provider yang sudah diriset (AWS, GCP, Alibaba, OCI, Biznet Gio) supaya tidak perlu diriset ulang saat fase cost dikerjakan.
- Refresh data dilakukan on-demand + cache singkat (lihat §6.1), bukan full real-time streaming.

## 5. Alur Pengguna Utama

1. User login via SSO → diarahkan ke dashboard sesuai role-nya.
2. Landing page: tabel gabungan VM dari semua provider yang dia punya akses, dengan filter provider/region/status di sidebar.
3. User apply filter (misal: provider=AWS, status=running) atau search by nama.
4. User klik satu VM → detail panel: spesifikasi & tag.
5. Admin: halaman terpisah untuk tambah/hapus koneksi akun cloud (credentials) dan atur role user.
6. Admin klik "Tambah Koneksi Akun Cloud" → pilih provider → isi form sesuai provider (field per provider lihat §7.3) → klik **"Test Connection"** → sistem validasi kredensial dgn API call read-only paling ringan ke provider tsb → kalau sukses, koneksi disimpan dgn status **Active**; kalau gagal, form menampilkan error spesifik (kredensial salah/permission kurang) sebelum disimpan.
7. Tiap koneksi akun cloud yang tersimpan tampil di list dgn badge status (**Active** / **Error** / **Expired** / **Pending**) + timestamp "last checked" — status di-refresh otomatis oleh background job berkala (lihat §6.1), jadi Admin tahu kalau ada kredensial invalid/revoked sebelum user lain mengalami error di dashboard.

## 6. Non-Functional Requirements

### 6.1 Performa & Live Pull
Skala target: 50–500 VM, banyak akun/project per provider. Live pull murni ke 5 API provider setiap kali user buka dashboard akan lambat dan berisiko kena rate limit. Maka:
- Data provider di-fetch **on-demand** per request, tapi disimpan di **cache jangka pendek** (Redis, TTL 2–5 menit) supaya request berikutnya (dari user lain / refresh) tidak selalu hit API provider.
- **Cache stampede protection**: saat TTL expired dan banyak user hit bersamaan, semua request bisa cache-miss serentak dan hammer API provider — bertentangan dengan tujuan caching di poin sebelumnya. Mitigasi: distributed lock (`SET NX PX` di Redis) di sekitar proses refill cache, jadi cuma satu request yang re-fetch ke provider, request lain menunggu/pakai data lama sebentar.
- **Fallback saat provider gagal di-fetch**: kalau request yang re-fetch itu sendiri gagal (provider down/timeout/dll), sistem tidak boleh langsung mengosongkan data provider tsb — selama masih ada cache lama yang belum kadaluarsa, itu tetap disajikan (ditandai indikator "Stale" di UI), dikombinasikan dengan status error provider di §6.3. Cache lama itu sendiri tidak ditulis ulang oleh fallback ini (murni dibaca), jadi umurnya tetap terikat TTL asalnya.
- Tersedia tombol "Refresh" manual untuk force-bypass cache saat butuh data ter-update.
- Fetch ke tiap provider dilakukan **paralel**, bukan sekuensial, supaya total waktu load ≈ waktu provider terlambat, bukan jumlah semuanya — dan hasil tiap provider ditampilkan di UI **begitu tersedia** (progressive, bukan tunggu-semua-baru-tampil), jadi provider yang cepat tidak ikut menunggu provider yang paling lambat sebelum user melihat apa pun.
- **Connection health check**: tiap koneksi akun cloud yang tersimpan divalidasi ulang otomatis oleh background job berkala (rekomendasi: tiap 6 jam — cukup cepat utk nangkep kredensial revoked/expired sebelum user lain kena error, tapi gak terlalu sering hit API provider cuma buat health check), pakai API call read-only paling ringan per provider (lihat §7.3). Status koneksi (**Active/Error/Expired/Pending**) di-update di Postgres tiap job jalan, ditampilkan di halaman kelola koneksi (§5).

### 6.2 Keamanan
- Credentials tiap cloud provider disimpan **terenkripsi** via Vault **KV v2 (static secrets engine)**, kecuali GCP yang justru **tidak ada static secret sama sekali** (lihat §7.3 — pakai Workload Identity Federation). Tidak pernah di-expose ke frontend.
- **AWS dan Alibaba Cloud tidak pakai model hub/AssumeRole** — tiap akun yang didaftarkan (AWS atau Alibaba Cloud) punya IAM User/RAM User + Access Key sendiri (Access Key ID/AccessKey ID di Postgres, Secret Access Key/AccessKey Secret di Vault KV v2 per-koneksi), sama seperti pola OCI/Biznet Gio. Setup jadi lebih sederhana (tidak perlu trust policy lintas akun atau kredensial hub terpisah), dengan trade-off memakai long-lived static key dibanding role assumption/temporary credential yang sebetulnya direkomendasikan AWS maupun Alibaba sendiri — keputusan sadar demi kesederhanaan operasional. Detail lengkap di §7.3.
- Prinsip least privilege: role IAM/service account yang dipakai untuk fetch inventory harus **read-only** (describe/list instances) — bukan permission yang bisa mengubah resource.
- Audit log untuk: siapa akses apa, perubahan role, perubahan koneksi akun cloud, hasil test connection (sukses/gagal).

### 6.3 Ketersediaan
- Kegagalan satu provider (API down/timeout) tidak boleh membuat seluruh dashboard gagal load — provider lain tetap tampil. Provider yang gagal ditandai dengan status error di UI, dan **kalau masih ada data cache terakhir yang berhasil di-fetch (lihat §6.1), data itu tetap ditampilkan** (badge "Stale" per-VM) alih-alih dikosongkan — VM dari provider tsb baru benar-benar hilang dari list kalau memang belum pernah berhasil di-fetch sebelumnya (graceful degradation).

## 7. Arsitektur

Sesuai preferensi: **microservices**, jalan di **Docker** untuk dev, siap deploy ke **Kubernetes** untuk production. Deployment akhir self-hosted di salah satu cloud provider yang sama.

### 7.1 Komponen

```
                          ┌─────────────────┐
                          │   Frontend SPA   │
                          │  (web dashboard) │
                          └────────┬─────────┘
                                   │ HTTPS
                          ┌────────▼─────────┐
                          │   API Gateway /   │
                          │       BFF         │
                          └───┬───────────┬───┘
                              │           │
                  ┌───────────▼───┐   ┌───▼────────────┐
                  │  Auth Service  │   │  RBAC Service   │
                  │ (OIDC/SSO)     │   │ (user/role/     │
                  │                │   │  account assign)│
                  └────────────────┘   └────────┬────────┘
                                                 │
                          ┌──────────────────────▼──────────────────────┐
                          │           Inventory Aggregator Service        │
                          │  (fan-out paralel ke tiap collector, merge,  │
                          │        cache read/write ke Redis)            │
                          └───┬──────┬──────┬──────┬──────┬─────────────┘
                              │      │      │      │      │
                        ┌─────▼┐ ┌───▼──┐┌──▼───┐┌──▼───┐┌─▼──────────┐
                        │ AWS  │ │ GCP  ││Alibaba││ OCI  ││ Biznet Gio │
                        │Collec│ │Collec││Collec ││Collec││ Collector  │
                        │ tor  │ │ tor  ││ tor   ││ tor  ││            │
                        └──────┘ └──────┘└───────┘└──────┘└────────────┘
                    (tiap collector resolve config koneksinya sendiri —
                     termasuk field secret — langsung dari RBAC, bukan
                     lewat Aggregator; lihat catatan di bawah diagram)

                  ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐
                  │ Redis (cache)  │  │  PostgreSQL   │  │  HashiCorp Vault   │
                  │                │  │ (users, roles,│  │  (KV v2 — field    │
                  │                │  │ cloud accounts,│ │  secret per akun   │
                  │                │  │ audit log)    │  │  cloud; klien satu- │
                  │                │  │               │  │  satunya: RBAC)    │
                  └────────────────┘  └──────────────┘  └───────────────────┘
```

- **Frontend SPA**: React/Vue (lihat §8), consume API dari BFF.
- **API Gateway / BFF**: satu pintu masuk, routing ke service lain, terapkan auth check.
- **Auth Service**: handle login OIDC ke Microsoft Entra ID (Microsoft 365), issue JWT session internal.
- **RBAC Service**: source of truth untuk user, role, dan mapping akun-cloud-ke-tim; juga satu-satunya service yang bicara ke Vault (lihat di bawah), dan yang di-hit langsung oleh tiap Provider Collector untuk resolve config koneksi (termasuk field secret yang sudah di-merge dari Vault) — bukan diteruskan lewat Aggregator, supaya Aggregator tidak pernah melihat credential sama sekali.
- **Inventory Aggregator**: orkestrasi fetch paralel ke 5 collector, merge hasil, kelola cache.
- **Provider Collectors (5 service terpisah, satu per provider)**: masing-masing encapsulate SDK & auth spesifik provider tsb, expose API seragam (`GET /instances`) ke Aggregator. Dipisah per service supaya rilis/scaling independen dan kegagalan satu provider terisolasi.
- **PostgreSQL**: metadata aplikasi (user, role, daftar akun cloud yang terdaftar + referensi ke secret, audit log) — **bukan** menyimpan data VM hasil live-pull (itu live/cache saja).
- **Redis**: cache hasil fetch inventory, TTL pendek.
- **HashiCorp Vault (KV v2)**: static secrets engine untuk field kredensial yang genuinely secret (lihat §6.2/§7.3 — hari ini OCI `Private Key`/`Passphrase`, Biznet Gio `x-token`, AWS `Secret Access Key`, dan Alibaba Cloud `AccessKey Secret`; field GCP semuanya identifier non-secret jadi cukup di Postgres, begitu juga AWS `Access Key ID` dan Alibaba `AccessKey ID`). RBAC adalah satu-satunya client Vault di seluruh sistem.

### 7.2 Integrasi per Provider

| Provider | Instance Data Source | Auth Method | Notes |
|---|---|---|---|
| AWS | EC2 `DescribeInstances` | **Static IAM User Access Key** (per-akun, read-only — `ec2:Describe*`) — lihat §7.3 | Paling matang API-nya. **Scope MVP: EC2 saja** — VM yang jalan di **AWS Lightsail** tidak masuk (lihat §11 poin 6) |
| GCP | Compute Engine `instances.list` | **Workload Identity Federation** (bukan Service Account JSON key — lihat §7.3), scope read-only (`compute.viewer`) | Perlu per-project atau org-level aggregation |
| Alibaba Cloud | ECS `DescribeInstances` | **Static RAM User Access Key** (per-akun, read-only — `AliyunECSReadOnlyAccess`) — lihat §7.3 | |
| OCI | Core Services `ListInstances` | API Signing Key + Config (statis, per-akun — confirmed masih pola yang benar utk kasus ini) | Auth signing sedikit beda (request signing), butuh SDK resmi |
| Biznet Gio Cloud | Portal API (`api.portal.biznetgio.com/v1`) — bukan OpenStack, tapi API custom per lini produk. **Scope MVP: NEO Lite & NEO Lite Pro saja** (NEO GPU & Baremetal belum dipakai perusahaan saat ini, di luar scope): `GET /neolites/accounts`, `GET /neolite-pros/accounts` (list) + `.../vm-details` (detail), `.../vm-state/{state}` (status) | Header custom `x-token` (bukan OAuth/API key standar) | Confirmed via `https://api.portal.biznetgio.com/v1/openapi.json`. Collector Biznet Gio fan-out ke **2 endpoint produk** (NEO Lite, NEO Lite Pro) dan digabung jadi satu daftar VM. NEO GPU & Baremetal endpoint-nya sudah ada di API dan bisa ditambahkan gampang kalau nanti dipakai (lihat §10 roadmap). |

> **Update (sudah dikonfirmasi)**: API instance-list Biznet Gio Cloud tersedia dan cukup lengkap untuk MVP.
>
> **`x-token` — sudah dikonfirmasi**: digenerate manual dari dashboard portal Biznet Gio, menu **"Generate API Key"**. Token **tidak expire** (tidak perlu mekanisme refresh/rotasi otomatis di Auth/Collector) dan **satu token berlaku untuk semua produk** (NEO Lite, NEO Lite Pro, NEO GPU, Baremetal) — jadi cukup satu credential per akun Biznet Gio yang didaftarkan Admin. Saat generate, ada pilihan scope **read-only** atau **read + write** — sesuai prinsip least privilege di §6.2, **wajib pakai scope read-only** untuk token yang dipakai Collector ini.
>
> **Catatan cost per provider (hasil riset context7, disimpan utk fase berikutnya)** — lihat §10 Roadmap.

### 7.3 Provisioning & Test Connection per Provider

Detail field form "Tambah Koneksi Akun Cloud" (§5) dan mekanisme validasinya, hasil riset context7 + websearch (per keputusan: GCP pakai Workload Identity Federation — bukan static key, sesuai current best practice provider tsb; AWS, Alibaba Cloud, OCI, dan Biznet Gio semuanya pakai static per-akun credential — pilihan sadar demi kesederhanaan setup per-akun, meski utk AWS/Alibaba masing-masing provider sendiri merekomendasikan role assumption/temporary credential dibanding long-lived key):

| Provider | Model koneksi | Field yang diisi Admin | Validasi saat "Test Connection" | Kredensial tersimpan |
|---|---|---|---|---|
| AWS | Static IAM User Access Key | **Access Key ID** + **Secret Access Key** (dibuat via IAM User baru khusus Cirrus di akun AWS yg didaftarkan, attach read-only policy mis. `AmazonEC2ReadOnlyAccess`) | `sts:GetCallerIdentity` (konfirmasi key valid) → `ec2:DescribeRegions` (konfirmasi scope EC2 read) | **Access Key ID** di **Postgres** (bukan secret). **Secret Access Key** di **Vault KV v2**, per-koneksi (tiap akun AWS punya masing-masing) — tidak ada kredensial hub. |
| GCP | Workload Identity Federation | **Project ID/Number**, **Workload Identity Pool ID**, **Provider ID** (dibuat di project GCP yg didaftarkan, trust ke OIDC issuer Cirrus), **Service Account email** yg di-impersonate (project tsb grant `roles/iam.workloadIdentityUser` ke identity Cirrus) | Exchange token via `iamcredentials.googleapis.com:generateAccessToken` → `resourcemanager.projects.testIamPermissions` (konfirmasi scope `compute.viewer`) | Semua field di atas **bukan secret** (cuma identifier) → cukup di **Postgres**, **tidak ada apa pun di Vault** utk GCP. Cirrus perlu OIDC issuer/JWKS endpoint sendiri (bagian dari Auth Service) yg divalidasi oleh provider GCP. |
| Alibaba Cloud | Static RAM User Access Key | **AccessKey ID** + **AccessKey Secret** (dibuat via RAM User baru khusus Cirrus di akun Alibaba yg didaftarkan, attach read-only policy mis. `AliyunECSReadOnlyAccess`) — tidak perlu pilih region, Collector otomatis discover (`ecs:DescribeRegions`) dan fetch dari semua region yang bisa diakses AccessKey tsb | `sts:GetCallerIdentity` (konfirmasi key valid) | **AccessKey ID** di **Postgres** (bukan secret). **AccessKey Secret** di **Vault KV v2**, per-koneksi (tiap akun Alibaba punya masing-masing) — tidak ada kredensial hub. |
| OCI | API Signing Key (statis, per-akun — tetap pola yg benar krn tiap tenancy OCI terpisah, bukan workload di dalam OCI) | **Tenancy OCID**, **User OCID**, **Fingerprint**, **Private Key** (upload/paste), **Region**, opsional **Passphrase** | `oci.config.validate_config()` (cek format) → `identity.list_regions()` (no policy needed, cek signing valid) → `compute.list_instances()` limit=1 (konfirmasi read-only policy benar-benar attached) | Private Key + field lain di **Vault KV v2**, per-koneksi (tiap tenancy OCI punya masing-masing). Disarankan bikin IAM user + policy read-only khusus di tenancy tsb (`allow group ReadOnlyGroup to inspect/read instance-family in tenancy`), bukan pakai akun tenancy-admin. |
| Biznet Gio Cloud | Static token | **`x-token`** (di-generate manual dari portal Biznet Gio, menu "Generate API Key", scope read-only) | `GET /neolites/accounts` (call termurah, 200 = valid, 401/403 = invalid) | `x-token` di **Vault KV v2**, per-koneksi. |

Status koneksi ditampilkan sbg badge di list (§5): **Pending** (baru disimpan, belum divalidasi) → **Active** (valid) → **Error** (auth/permission gagal) → **Expired** (dulu valid, sekarang invalid — misal token di-revoke). Background job re-validasi tiap 6 jam (lihat §6.1) meng-update status ini otomatis di luar test manual saat setup.

## 8. Tech Stack (usulan)

Karena belum ada preferensi bahasa spesifik dan arsitekturnya microservices + Docker/K8s:

- **Frontend**: React + TypeScript (Vite), sudah umum dan ekosistem library tabel/filter kaya.
- **Backend services**: Go atau Node.js/TypeScript untuk tiap microservice — direkomendasikan **Go** untuk Provider Collectors (fan-out paralel pakai `golang.org/x/sync/errgroup` — `errgroup.WithContext` supaya kalau satu collector gagal, context di-cancel tanpa nge-block collector lain, cocok dgn requirement graceful degradation §6.3; SDK cloud provider tersedia untuk semuanya kecuali perlu cek SDK resmi Biznet Gio), **Node.js/TypeScript** untuk BFF/Aggregator/RBAC service (lebih cepat develop, konsisten dgn frontend).
- **Database**: PostgreSQL (metadata), Redis (cache).
- **Secret management**: HashiCorp Vault (KV v2 static secrets engine — lihat §6.2) atau cloud-native KMS (tergantung tempat deploy akhir).
- **Container & orchestration**: Docker Compose untuk local dev, **Helm umbrella chart** (tiap microservice jadi subchart) untuk deploy ke Kubernetes production — supaya tetap bisa release/scaling independen per service (sesuai tujuan pemisahan service di §7.1), bukan satu chart monolitik.
- **Observability**: Prometheus + Grafana untuk metrics, terutama latency tiap collector (penting karena live-pull ke 5 API eksternal).

> **Open question**: kalau tim sudah punya standar bahasa/stack di proyek lain, kabari — bisa disesuaikan supaya konsisten dengan tooling CI/CD & observability yang sudah ada.

## 9. Metrics Keberhasilan

- Waktu load dashboard (dengan cache warm) < 2 detik; cold fetch (bypass cache) < 8 detik untuk 500 VM lintas 5 provider.
- 100% VM yang ada di 5 provider tersebut muncul di inventory (tidak ada yang miss karena scope IAM/permission salah).
- Adopsi: minimal tim infra/devops berhenti buka console provider satu-satu untuk cek inventory rutin (qualitative check via feedback).

## 10. Roadmap / Fase Selanjutnya (di luar MVP)

- **Cost/billing info per VM** (estimasi biaya harian/bulanan + agregat per provider/akun/tim) — dipindah dari MVP pertama supaya development bisa fokus inventory dulu (lihat §4.2). Catatan teknis dari riset awal (context7), disimpan supaya tidak perlu diriset ulang saat fase ini mulai dikerjakan:
  - **AWS**: `GetCostAndUsage` biasa **tidak** kasih cost per-instance (cuma group by service/tag). Yang per-instance: `GetCostAndUsageWithResources` — tapi butuh "resource-level data" diaktifkan dulu di Cost Explorer (biaya tambahan) dan history-nya cuma ±14 hari. Untuk agregat bulanan per-VM yang akurat, perlu **Cost & Usage Report (CUR)** dgn resource ID — file export batch ke S3, bukan REST call sinkron. IAM butuh policy `ce:GetCostAndUsage*` terpisah dari `ec2:Describe*`.
  - **GCP**: Cloud Billing API (`cloudbilling.googleapis.com`) cuma expose katalog SKU/pricing & budget, **bukan** actual spend per resource. Sumber yang benar: **BigQuery Billing Export** (detailed usage cost export, field `resource.name`) — perlu setup dataset BigQuery & query SQL. Service account butuh role `bigquery.dataViewer` + `bigquery.jobUser` terpisah dari `compute.viewer`.
  - **Alibaba Cloud**: BSS OpenAPI `DescribeInstanceBill` — punya field `InstanceID`, cost per-instance genuinely tersedia via REST call biasa (lebih simple dari AWS/GCP).
  - **OCI**: Usage API `requestSummarizedUsages` dengan grouping "ResourceId Summary" — cost per-instance tersedia via REST call biasa.
  - **Biznet Gio Cloud**: tidak ada endpoint billing/cost/usage sama sekali di API-nya (sudah dicek ke OpenAPI spec). Rencana: kolom cost default "N/A" dengan opsi input manual oleh Admin (form di detail VM, disimpan di PostgreSQL bukan Redis, ditandai badge "manual entry", ikut masuk agregat cost per tim tapi tidak auto-update kalau harga paket berubah).
  - **Dampak arsitektur**: AWS & GCP butuh proses batch/ETL periodik (baca CUR/BigQuery export → tulis ke Postgres/Redis), beda dari model live-pull on-demand di §6.1 yang berlaku untuk instance data — perlu keputusan arsitektur sebelum development fase ini dimulai.
  - Tiap provider punya granularitas & delay data yang beda (AWS Cost Explorer ada delay ~24 jam) — perlu disclaimer di UI bahwa angka cost adalah estimasi, bukan invoice final.
- Alerting (VM idle, VM baru terdeteksi, anomali cost).
- Cost trend chart & budget threshold.
- Export ke CSV/Excel.
- Resource lain (storage, network, managed database).
- Rekomendasi cost optimization (rightsizing, idle detection otomatis).
- Biznet Gio NEO GPU & Baremetal — kalau nanti mulai dipakai, tinggal tambah 2 endpoint collector (`GET /neo-gpus/accounts`, `GET /baremetals/accounts`), sudah tersedia di API-nya (lihat §7.2).

## 11. Risiko & Open Questions (ringkasan)

1. ~~Biznet Gio Cloud API~~ — **Resolved**: API instance-list confirmed tersedia (`api.portal.biznetgio.com/v1`, lihat §7.2). `x-token` digenerate manual dari menu "Generate API Key" di portal, tidak expire, satu token untuk semua produk, pilih scope **read-only** saat generate.
2. ~~IdP perusahaan~~ — **Resolved**: Microsoft 365 / Microsoft Entra ID, via OIDC.
3. **Kredensial read-only per provider** — perlu koordinasi dengan tim yang pegang akun cloud untuk provisioning IAM role/service account read-only per provider (AWS/GCP/Alibaba/OCI) dan generate `x-token` read-only (Biznet Gio) — ini prasyarat sebelum development collector bisa di-test end-to-end. Catatan tambahan untuk Biznet Gio: karena token **tidak expire**, kalau bocor tetap valid selamanya sampai di-revoke manual — perlu kebijakan rotasi berkala manual (mis. tiap 6–12 bulan) meski provider-nya tidak mewajibkan.
4. ~~Baremetal Biznet Gio~~ — **Resolved (di luar scope)**: perusahaan saat ini hanya pakai NEO Lite & NEO Lite Pro, jadi NEO GPU & Baremetal tidak masuk MVP (lihat §7.2, §10).
5. **Setup Workload Identity Federation per akun GCP** — dgn pola GCP Workload Identity Federation (§7.3), tim yang pegang akun GCP perlu bikin OIDC provider/trust policy sendiri per project (bukan cuma copy-paste 1 static key) — ini lebih secure tapi setup-nya lebih banyak langkah dibanding AccessKey/Secret biasa. AWS dan Alibaba Cloud sengaja dikecualikan dari pola ini (pakai static per-akun Access Key, sama seperti OCI/Biznet Gio) demi kesederhanaan setup, dengan trade-off keamanan yang sudah didiskusikan di §6.2. GCP WIF khususnya butuh Cirrus punya OIDC issuer/JWKS endpoint sendiri (bagian dari Auth Service) — perlu dipastikan ini bisa dibangun sebelum development GCP Collector dimulai.
6. **AWS Lightsail di luar scope MVP** — AWS Collector (§7.2) cuma manggil EC2 API (`ec2:Describe*`), dan policy `AmazonEC2ReadOnlyAccess` yang disarankan di §7.3 juga tidak meng-cover `lightsail:*` sama sekali (confirmed dari JSON policy resminya — cuma `ec2:Describe*`, `elasticloadbalancing:Describe*`, `cloudwatch:*` metrics/describe, `autoscaling:Describe*`). Jadi kalau ada VM perusahaan yang jalan di AWS Lightsail (bukan EC2 murni), itu **tidak akan muncul** di inventory Cirrus — bukan cuma soal IAM permission, tapi memang belum ada pemanggilan Lightsail API di collector-nya. Perlu dipastikan dulu apakah perusahaan pakai Lightsail; kalau ya, ini jadi item pengembangan terpisah (tambah client Lightsail + policy read-only-nya sendiri di AWS Collector).
