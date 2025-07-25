#!/bin/bash

# Air Assist Frontend - GitHub Setup Script

echo "🚀 Setting up Air Assist Frontend for GitHub..."

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit - Air Assist Frontend PWA

Features:
- Voice-controlled interface
- OpenAI integration
- Bluetooth support
- PWA capabilities
- Responsive design
- Real-time communication"

# Set main branch
git branch -M main

echo "✅ Git repository initialized!"
echo ""
echo "📝 Next steps:"
echo "1. Create a new repository on GitHub named 'air-assist-frontend'"
echo "2. Run: git remote add origin https://github.com/YOUR_USERNAME/air-assist-frontend.git"
echo "3. Run: git push -u origin main"
echo "4. Deploy to Vercel using the GitHub repository"
echo ""
echo "🔗 Repository URL format: https://github.com/YOUR_USERNAME/air-assist-frontend"
