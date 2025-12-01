
PS C:\Users\vulin\Desktop\app\Stress_Test\billing> k6 run k6-billing-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-billing-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):      
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000]
========== BILLING STRESS TEST ==========    source=console
INFO[0000] Target API: http://localhost:3000             source=console
INFO[0000] ==========================================    source=console
INFO[0000] ✓ Billing API health check passed             source=console
WARN[0261] The test has generated metrics with 100060 unique time series, which is higher than the suggested limit of 100000 and could cause high memory usage. Consider not using high-cardinality values like unique IDs as metric tags or, if you need them in the URL, use the name metric tag or URL grouping. See https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/ for details.  component=metrics-engine-ingester
INFO[0360]
========== TEST COMPLETE ==========          source=console
INFO[0360] Duration: 360.77s                             source=console                           
INFO[0360] ===================================           source=console                           
                                                                                                  
                                                                                                  
  █ THRESHOLDS                                                                                    

    http_req_duration
    ✓ 'p(95)<600' p(95)=580.56ms

    http_req_failed
    ✓ 'rate<0.1' rate=0.00%

    success_rate
    ✓ 'rate>0.9' rate=100.00%


  █ TOTAL RESULTS

    checks_total.......: 45095   124.974575/s
    checks_succeeded...: 100.00% 45095 out of 45095
    checks_failed......: 0.00%   0 out of 45095

    ✓ create 201
    ✓ create has invoice
    ✓ list 200
    ✓ get 200
    ✓ status update ok

    CUSTOM
    invoice_create_latency.........: avg=319.151791 min=61       med=242     max=2237  p(90)=600.2    p(95)=777.1
    invoices_created...............: 9019    24.994915/s
    success_rate...................: 100.00% 9019 out of 9019

    HTTP
    http_req_duration..............: avg=171.28ms   min=2.6ms    med=94.26ms max=2.95s p(90)=429.58ms p(95)=580.56ms
      { expected_response:true }...: avg=171.28ms   min=2.6ms    med=94.26ms max=2.95s p(90)=429.58ms p(95)=580.56ms
    http_req_failed................: 0.00%   0 out of 36077
    http_reqs......................: 36077   99.982431/s

    EXECUTION
    iteration_duration.............: avg=1.93s      min=638.83ms med=1.87s   max=5.33s p(90)=2.85s    p(95)=3.29s
    iterations.....................: 9019    24.994915/s
    vus............................: 3       min=1            max=100
    vus_max........................: 100     min=100          max=100

    NETWORK
    data_received..................: 129 MB  357 kB/s
    data_sent......................: 9.0 MB  25 kB/s




running (6m00.8s), 000/100 VUs, 9019 complete and 0 interrupted iterations
default ✓ [======================================] 000/100 VUs  6m0s
PS C:\Users\vulin\Desktop\app\Stress_Test\billing> 



PS C:\Users\vulin\Desktop\app\Stress_Test\billing> k6 run k6-billing-1000vus-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-billing-1000vus-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 500 max VUs, 9m0s max duration (incl. graceful stop):       
              * default: Up to 500 looping VUs for 8m30s over 6 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000]
========== BILLING 1000 VUs STRESS TEST ==========  source=console
INFO[0000] Target API: http://localhost:3000             source=console
INFO[0000] Strategy: Direct Invoice API testing (no Order dependency)  source=console
INFO[0000] ==================================================  source=console
INFO[0000] ✓ Billing API (invoices) health check passed  source=console
INFO[0514]
========== BILLING 1000 VUs TEST COMPLETE ==========  source=console
INFO[0514] Total duration: 513.89s                       source=console                           
INFO[0514] ====================================================  source=console                   

╔════════════════════════════════════════════════════════════════════╗
║     BILLING API (via Orders) - 1000 VUs STRESS TEST RESULTS       ║
╠════════════════════════════════════════════════════════════════════╣
║ Total Requests:                                           24740 ║
║ Failed Rate:                                              0.00% ║
║ Avg Response Time:                                    1964.27ms ║
║ P95 Response Time:                                    5870.42ms ║
║ P99 Response Time:                                    7355.05ms ║
╠════════════════════════════════════════════════════════════════════╣
║ Orders Created:                                            6280 ║
║ Invoices Read:                                             6329 ║
║ Status Updated:                                            2644 ║
║ Errors:                                                       0 ║
╚════════════════════════════════════════════════════════════════════╝
                                                                                                  
running (8m34.0s), 000/500 VUs, 31621 complete and 0 interrupted iterations                       
default ✓ [======================================] 000/500 VUs  8m30s         