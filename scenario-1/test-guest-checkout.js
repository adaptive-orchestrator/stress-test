/**
 * Test câu: "Tôi muốn bật tính năng Guest Checkout cho khách mua nhanh, chỉ tôi chỗ cấu hình với?"
 * 
 * Đây là câu hỏi hướng dẫn cấu hình - có thể thuộc:
 * 1. /llm-orchestrator/chat - general chat
 * 2. /llm-orchestrator/recommend-model - nếu LLM hiểu là cần retail model
 */
const http = require('http');

const PROMPT = 'Tôi muốn bật tính năng Guest Checkout cho khách mua nhanh, chỉ tôi chỗ cấu hình với?';

async function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('═'.repeat(70));
  console.log('  TEST: Guest Checkout Configuration Question');
  console.log('═'.repeat(70));
  console.log('\n📝 PROMPT:', PROMPT);
  console.log('\n');

  // 1. Login
  console.log('🔐 Đang login...');
  const loginRes = await httpRequest({
    hostname: 'localhost', port: 3000, path: '/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin2@demo.com', password: 'Admin@123' });
  
  const token = loginRes.data?.accessToken || loginRes.accessToken;
  if (!token) {
    console.log('❌ Login failed!');
    return;
  }
  console.log('✅ Login thành công!\n');

  // 2. Test với /llm-orchestrator/chat
  console.log('─'.repeat(70));
  console.log('  ENDPOINT 1: /llm-orchestrator/chat');
  console.log('─'.repeat(70));
  
  try {
    const chatRes = await httpRequest({
      hostname: 'localhost', port: 3000, 
      path: '/llm-orchestrator/chat', 
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    }, { message: PROMPT, lang: 'vi' });
    
    console.log('\n📥 RESPONSE:');
    console.log(JSON.stringify(chatRes, null, 2));
  } catch (err) {
    console.log('❌ Error:', err.message);
  }

  // 3. Test với /llm-orchestrator/recommend-model (xem LLM có hiểu context không)
  console.log('\n' + '─'.repeat(70));
  console.log('  ENDPOINT 2: /llm-orchestrator/recommend-model');
  console.log('─'.repeat(70));
  
  try {
    const recommendRes = await httpRequest({
      hostname: 'localhost', port: 3000, 
      path: '/llm-orchestrator/recommend-model', 
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    }, { business_description: PROMPT, lang: 'vi' });
    
    console.log('\n📥 RESPONSE:');
    console.log(JSON.stringify(recommendRes, null, 2));
    
    if (recommendRes.recommended_model) {
      console.log('\n🎯 ANALYSIS:');
      console.log('   - Guest Checkout = bán cho khách vãng lai, không cần tài khoản');
      console.log('   - Expected model: retail (vì không cần lưu thông tin khách)');
      console.log('   - Got model:', recommendRes.recommended_model);
      console.log('   - Match?', recommendRes.recommended_model.toLowerCase() === 'retail' ? '✅ YES' : '❌ NO');
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  KẾT LUẬN');
  console.log('═'.repeat(70));
  console.log('  Câu này có thể thuộc:');
  console.log('  1. Chat endpoint - nếu user hỏi hướng dẫn cấu hình');
  console.log('  2. Recommend-model - nếu LLM hiểu là cần gợi ý business model');
  console.log('  → Xem response ở trên để quyết định đặt vào Group nào\n');
}

main().catch(console.error);
