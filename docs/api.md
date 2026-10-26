# EatHealthy API

Base URL: http://localhost:8000

## Endpoints

- GET /api/foods
- GET /api/foods/{food_name}
- GET /api/diets
- GET /api/profile/options
- GET /api/profile/relationships
- GET /api/recommendations/{person_name}
- POST /api/users/register
- POST /api/users/login
- GET /api/users/me
- POST /api/users (admin)
- GET /api/users (admin)
- PATCH /api/users/{person_name}/role (admin)
- PUT /api/users/{person_name}
- DELETE /api/users/{person_name} (admin)

## User management

Accounts and profiles are stored as RDF triples in the Fuseki
`eathealthy` dataset. Passwords are stored as salted PBKDF2 hashes,
never as plain text. Login returns a bearer access token.

Clients can update their own profile. Administrators can create, list,
update, and delete users. Set `EATHEALTHY_JWT_SECRET` to a strong secret
before using authentication outside local development.

Fuseki must expose both endpoints:

- Query: `http://localhost:3030/eathealthy/query`
- Update: `http://localhost:3030/eathealthy/update`

### First administrator

Run the bootstrap command once, before using administrator endpoints.
It refuses to run if any `eh:UserAccount` already exists.
The password is read from an environment variable and is never written
to the repository or printed.

PowerShell example:

```powershell
$env:EATHEALTHY_ADMIN_USERNAME = "admin"
$env:EATHEALTHY_ADMIN_PASSWORD = "use-a-strong-password"
$env:EATHEALTHY_ADMIN_NAME = "EatHealthy Administrator"
$env:EATHEALTHY_ADMIN_AGE = "30"
$env:EATHEALTHY_ADMIN_WEIGHT = "75"
$env:EATHEALTHY_ADMIN_HEIGHT = "175"
$env:EATHEALTHY_ADMIN_SEX = "not_specified"
python -m backend.scripts.bootstrap_admin
```

Set `EATHEALTHY_JWT_SECRET` in the same shell before starting FastAPI.
The command uses `FUSEKI_ENDPOINT` and `FUSEKI_UPDATE_ENDPOINT` when
those variables are configured; otherwise it uses the local defaults.

## Interactive Documentation

FastAPI Swagger UI:
http://localhost:8000/docs
