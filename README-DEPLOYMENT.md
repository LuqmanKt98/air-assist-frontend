# Air Assist Frontend - Vercel Deployment

## 🚀 Quick Deploy to Vercel

### Prerequisites
1. GitHub account
2. Vercel account (free)
3. Backend already deployed

### Step 1: Push to GitHub
```bash
# Create new repository on GitHub: air-assist-frontend
git init
git add .
git commit -m "Initial commit - Air Assist Frontend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/air-assist-frontend.git
git push -u origin main
```

### Step 2: Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your `air-assist-frontend` repository
4. Configure environment variables:
   - `VITE_BACKEND_URL`: `https://your-backend-url.vercel.app`
   - `VITE_WEBSOCKET_URL`: `wss://your-backend-url.vercel.app/openai-realtime`
   - `VITE_DEFAULT_N8N_URL`: `https://n8n.dev.quantumos.ai/webhook/air`
   - `VITE_APP_NAME`: `Air Assist`
   - `VITE_NODE_ENV`: `production`
   - `VITE_DEBUG_MODE`: `false`

### Step 3: Deploy
- Click "Deploy"
- Wait for deployment to complete
- Your app will be available at: `https://air-assist-frontend.vercel.app`

## 🔧 Environment Variables

Copy these to your Vercel project settings:

```
VITE_BACKEND_URL=https://air-assist-backend.vercel.app
VITE_WEBSOCKET_URL=wss://air-assist-backend.vercel.app/openai-realtime
VITE_DEFAULT_N8N_URL=https://n8n.dev.quantumos.ai/webhook/air
VITE_APP_NAME=Air Assist
VITE_NODE_ENV=production
VITE_DEBUG_MODE=false
```

## 📱 PWA Features
- Installable on mobile and desktop
- Offline support
- Service worker enabled
- Manifest.json configured

## 🔗 Links
- Frontend: https://air-assist-frontend.vercel.app
- Backend: https://air-assist-backend.vercel.app
