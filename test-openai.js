// Test script to verify OpenAI Chat Completions API
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend
config({ path: path.join(__dirname, '../backend/.env') });

// Get API key from environment variables
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  console.error('Please ensure the .env file exists in the backend directory');
  process.exit(1);
}

async function testOpenAI() {
  console.log('🧪 Testing OpenAI Chat Completions API...');
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: 'Hello! Please respond with a short greeting.'
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message?.content;

    if (assistantMessage) {
      console.log('✅ OpenAI API test successful!');
      console.log('📝 Response:', assistantMessage);
      return true;
    } else {
      console.log('❌ No response content received');
      return false;
    }
  } catch (error) {
    console.error('❌ OpenAI API test failed:', error.message);
    return false;
  }
}

// Run the test
testOpenAI().then(success => {
  process.exit(success ? 0 : 1);
});
