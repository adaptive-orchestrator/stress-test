/**
 * Test single case from each group to show full LLM response
 */
const http = require('http');

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
  // 1. Login
  console.log('═'.repeat(60));
  console.log('  1. LOGIN');
  console.log('═'.repeat(60));
  
  const loginRes = await httpRequest({
    hostname: 'localhost', port: 3000, path: '/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin2@demo.com', password: 'Admin@123' });
  
  const token = loginRes.data?.accessToken || loginRes.accessToken;
  console.log('Token:', token ? '✅ Got token' : '❌ No token');

  // 2. Test Group A - recommend-model
  console.log('\n' + '═'.repeat(60));
  console.log('  2. TEST GROUP A: RECOMMEND MODEL');
  console.log('═'.repeat(60));
  console.log('\n📤 REQUEST:');
  console.log('   Endpoint: POST /llm-orchestrator/recommend-model');
  console.log('   Body: { business_description: "Tôi muốn bán sản phẩm SaaS với gói tháng và năm" }');
  
  const resA = await httpRequest({
    hostname: 'localhost', port: 3000, path: '/llm-orchestrator/recommend-model', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  }, { business_description: 'Tôi muốn bán sản phẩm SaaS với gói tháng và năm', lang: 'vi' });
  
  console.log('\n📥 LLM RESPONSE:');
  console.log(JSON.stringify(resA, null, 2));
  
  console.log('\n🔍 VALIDATION LOGIC:');
  console.log('   - Kiểm tra: recommended_model có tồn tại không?');
  console.log('   - recommended_model =', resA.recommended_model);
  const validModelsA = ['retail', 'subscription', 'freemium', 'multi'];
  const isValidA = validModelsA.includes(resA.recommended_model?.toLowerCase());
  console.log('   - Là valid model (retail/subscription/freemium/multi)?', isValidA ? 'YES' : 'NO');
  console.log('   → KẾT QUẢ:', isValidA ? '✅ PASS' : '❌ FAIL');

  // 3. Test Group B - text-to-sql
  console.log('\n' + '═'.repeat(60));
  console.log('  3. TEST GROUP B: TEXT TO SQL');
  console.log('═'.repeat(60));
  console.log('\n📤 REQUEST:');
  console.log('   Endpoint: POST /llm-orchestrator/text-to-sql');
  console.log('   Body: { question: "Doanh thu tháng 12 năm 2025 là bao nhiêu?" }');
  
  const resB = await httpRequest({
    hostname: 'localhost', port: 3000, path: '/llm-orchestrator/text-to-sql', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  }, { question: 'Doanh thu tháng 12 năm 2025 là bao nhiêu?', lang: 'vi' });
  
  console.log('\n📥 LLM RESPONSE:');
  console.log(JSON.stringify(resB, null, 2));
  
  console.log('\n🔍 VALIDATION LOGIC:');
  console.log('   - Kiểm tra: SQL được generate không?');
  console.log('   - sql =', resB.sql);
  console.log('   - natural_response =', resB.natural_response?.substring(0, 100) + '...');
  console.log('   - raw_data =', resB.raw_data);
  const isValidB = resB.sql && resB.sql.length > 0;
  console.log('   - Có SQL query?', isValidB ? 'YES' : 'NO');
  console.log('   → KẾT QUẢ:', isValidB ? '✅ PASS' : '❌ FAIL');

  // 4. Test Group C - RCA
  console.log('\n' + '═'.repeat(60));
  console.log('  4. TEST GROUP C: RCA (Root Cause Analysis)');
  console.log('═'.repeat(60));
  console.log('\n📤 REQUEST:');
  console.log('   Endpoint: POST /llm-orchestrator/analyze-incident');
  console.log('   Body: { incident_description: "[PaymentService] Error: StripeError: card_declined" }');
  
  const resC = await httpRequest({
    hostname: 'localhost', port: 3000, path: '/llm-orchestrator/analyze-incident', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  }, { 
    incident_description: '[PaymentService] Error processing payment #TXN-2025-001: StripeError: card_declined - insufficient_funds',
    lang: 'vi' 
  });
  
  console.log('\n📥 LLM RESPONSE:');
  console.log(JSON.stringify(resC, null, 2));
  
  console.log('\n🔍 VALIDATION LOGIC:');
  console.log('   - Kiểm tra: Có analysis với root_cause không?');
  // severity nằm trong analysis object
  const severity = resC.analysis?.severity || resC.severity;
  const rootCause = resC.analysis?.root_cause;
  const confidence = resC.analysis?.confidence;
  console.log('   - severity =', severity);
  console.log('   - root_cause =', rootCause ? rootCause.substring(0, 80) + '...' : 'N/A');
  console.log('   - confidence =', confidence);
  const isValidC = (severity && resC.analysis) || (resC.success && resC.analysis?.root_cause);
  console.log('   - Có analysis hợp lệ?', isValidC ? 'YES' : 'NO');
  console.log('   → KẾT QUẢ:', isValidC ? '✅ PASS' : '❌ FAIL');

  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log('  Group A (Recommend Model):', isValidA ? '✅ PASS' : '❌ FAIL');
  console.log('  Group B (Text-to-SQL):', isValidB ? '✅ PASS' : '❌ FAIL');
  console.log('  Group C (RCA):', isValidC ? '✅ PASS' : '❌ FAIL');
}

main().catch(console.error);
