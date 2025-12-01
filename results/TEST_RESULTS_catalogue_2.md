PS C:\Users\vulin\Desktop\app\Stress_Test\Catalogue> k6 run k6-catalogue-stress-test.js    

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-catalogue-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000] 🚀 Starting Catalogue API Stress Test...       source=console
INFO[0000] 📍 Base URL: http://localhost:3000             source=console
INFO[0000] ✅ API is ready                                source=console
WARN[0261] The test has generated metrics with 100008 unique time series, which is higher than the suggested limit of 100000 and could cause high memory usage. Consider not using high-cardinality values like unique IDs as metric tags or, if you need them in the URL, use the name metric tag or URL grouping. See https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/ for details.  component=metrics-engine-ingester
INFO[0360] ✅ Test completed at: 2025-11-27T18:14:19.425Z  source=console
INFO[0360] 📊 Check the summary above for detailed metrics  source=console                 


  █ THRESHOLDS

    errors
    ✓ 'rate<0.1' rate=0.00%

    http_req_duration
    ✓ 'p(95)<500' p(95)=489.12ms

    http_req_failed
    ✓ 'rate<0.1' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 84231   233.773023/s
    checks_succeeded...: 100.00% 84231 out of 84231
    checks_failed......: 0.00%   0 out of 84231

    ✓ create status is 201
    ✓ create response has product
    ✓ get status is 200
    ✓ get returns correct product
    ✓ list status is 200
    ✓ list returns array
    ✓ list has pagination metadata
    ✓ update status is 200
    ✓ update reflects changes

    CUSTOM
    errors.........................: 0.00%  0 out of 18718

    HTTP
    http_req_duration..............: avg=151.15ms min=504.6µs  med=91.08ms max=1.43s p(90)=365.41ms p(95)=489.12ms
      { expected_response:true }...: avg=151.15ms min=504.6µs  med=91.08ms max=1.43s p(90)=365.41ms p(95)=489.12ms
    http_req_failed................: 0.00%  0 out of 37437
    http_reqs......................: 37437  103.901897/s

    EXECUTION
    iteration_duration.............: avg=1.86s    min=592.37ms med=1.82s   max=4.35s p(90)=2.77s    p(95)=3.11s
    iterations.....................: 9359   25.97478/s
    vus............................: 3      min=1          max=100
    vus_max........................: 100    min=100        max=100

    NETWORK
    data_received..................: 95 MB  264 kB/s
    data_sent......................: 9.2 MB 26 kB/s



                                                                                           
running (6m00.3s), 000/100 VUs, 9359 complete and 0 interrupted iterations                 
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\Catalogue> 


CPU
memory