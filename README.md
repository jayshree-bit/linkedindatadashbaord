# Prospect Manager (React + Redux + Node + MongoDB)

## Run
1. Start MongoDB locally (or set MONGO_URI in backend/.env to Atlas).
2. Backend:  cd backend && npm install && npm run dev   (http://localhost:5000)
3. Frontend: cd frontend && npm install && npm run dev  (http://localhost:5173)

## Default login (created on first start)
admin@example.com / Admin@123   (change in backend/.env before first run)

## Roles (stored in the `roles` collection, editable from User manager)
- Admin   : view + edit prospect, company, users (locked)
- Manager : view + edit prospect, company
- User    : view prospect, company

## API
- Public : GET  /api/public/health
- Auth   : POST /api/auth/login, GET /api/auth/me
- Private (Bearer token + permission):
  /api/private/users, /api/private/roles, /api/private/data/:resource (prospect | company)
