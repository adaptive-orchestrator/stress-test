PS C:\Users\vulin\Desktop\app\Stress_Test\subscription> k6 run k6-subscription-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-subscription-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000] Subscription API is healthy. Found undefined existing subscriptions.  source=console
INFO[0000] Starting stress test on READ and UPDATE operations...  source=console           


  █ THRESHOLDS

    http_req_duration
    ✗ 'p(95)<700' p(95)=5.9s

    http_req_failed
    ✓ 'rate<0.1' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 4566    12.663918/s
    checks_succeeded...: 100.00% 4566 out of 4566
    checks_failed......: 0.00%   0 out of 4566

    ✓ list 200

    HTTP
    http_req_duration..............: avg=2.98s min=31.03ms  med=2.83s max=8.42s p(90)=5.32s p(95)=5.9s
      { expected_response:true }...: avg=2.98s min=31.03ms  med=2.83s max=8.42s p(90)=5.32s p(95)=5.9s
    http_req_failed................: 0.00%  0 out of 4567
    http_reqs......................: 4567   12.666692/s

    EXECUTION
    iteration_duration.............: avg=3.83s min=358.86ms med=3.68s max=9.33s p(90)=6.44s p(95)=7.13s
    iterations.....................: 4566   12.663918/s
    vus............................: 2      min=1         max=100
    vus_max........................: 100    min=100       max=100

    NETWORK
    data_received..................: 3.7 GB 10 MB/s
    data_sent......................: 379 kB 1.1 kB/s



                                                                                           
running (6m00.6s), 000/100 VUs, 4566 complete and 0 interrupted iterations                 
default ✓ [======================================] 000/100 VUs  6m0s                       
ERRO[0360] thresholds on metrics 'http_req_duration' have been crossed