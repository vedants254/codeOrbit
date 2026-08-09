# CodeOrbit – Frontend

A production-ready frontend built with **Next.js**, **TypeScript**, **TailwindCSS**, **ShadCN UI**, and **Auth.js**. This app visualizes repository structures and content by interacting with backend APIs.

---

## 📦 Tech Stack

- **Next.js** (App Router + TypeScript)
- **TailwindCSS** (utility-first styling)
- **ShadCN/UI** (component library)
- **Auth.js** (authentication & authorization)
- **OpenAPI SDK** (`api-client/` auto-generated)
- **PNPM** (package manager)

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/CodeOrbit.git
cd CodeOrbit
```

### 2. Install Dependencies

Using **pnpm** (preferred):

```bash
pnpm install
```

Or, if using npm:

```bash
npm install
```

### 3. Setup Environment Variables

Create a `.env.local` file by copying the example:

```bash
cp .example.env .env.local
```

### 4. Auth.js Setup

The app uses **Auth.js** for authentication. Configuration is located in:

- `app/api/auth/[...nextauth]/route.ts` - Auth.js API routes
- `auth.ts` - Auth configuration and providers

Run the following command to generate `AUTH_SECRET`:

```bash
npm run generate:secret
```

#### Supported Providers:

- **GitHub** (recommended for Git-related apps)

To add more providers, update the providers array in `auth.ts`.

### 5. Run Development Server

```bash
pnpm dev
```

This runs the app in development mode.
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### 6. Build for Production

```bash
pnpm build
pnpm start
```

- `build` generates the production-optimized files
- `start` runs the production server

### 7. Lint the Code

```bash
pnpm lint
```

---

## 🔐 Authentication Flow

1. **Sign In**: Users can authenticate via GitHub
2. **Session Management**: Auth.js handles session persistence and validation
3. **Protected Routes**: Use middleware to protect authenticated routes
4. **API Integration**: Authenticated requests include user tokens for backend API calls

## ⚙️ Scripts

| Script         | Description                      |
| -------------- | -------------------------------- |
| `dev`          | Run dev server with Turbopack    |
| `build`        | Create production build          |
| `start`        | Start production server          |
| `lint`         | Run ESLint                       |
| `generate:api` | Regenerate SDK from OpenAPI spec |
| `setup:env`    | Copy .env.example to .env.local  |
| `setup:secret` | Generate secure `AUTH_SECRET`    |

---

## 📁 Project Structure

```
.
├── api-client/           # Auto-generated OpenAPI SDK files
├── app/
│   ├── api/auth/         # Auth.js API routes
│   ├── signin/           # Authentication pages (login)
│   └── ...               # Other Next.js App Router pages
├── components/
│   └── ui/               # ShadCN components
└── ...                   # Other resuable
context
├── ...                   # React context functions
├── middleware.ts         # Next.js middleware for route protection
├── public/               # Static assets (images, icons)
├── utils/                # API helpers &
├── .example.env          # Sample environment variables
├── next.config.ts        # Next.js configuration
├── openapi-ts.config.ts  # OpenAPI SDK generation config
```

---

## 🛡️ Security Considerations

- **Environment Variables**: Never commit sensitive keys to version control
- **NEXTAUTH_SECRET**: Use a secure, randomly generated secret in production
- **HTTPS**: Always use HTTPS in production for Auth.js
- **Database Security**: If using database sessions, ensure proper connection security
- **OAuth Apps**: Configure OAuth redirect URIs correctly for each environment

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the Apache License. See the [LICENSE](LICENSE) file for details.
