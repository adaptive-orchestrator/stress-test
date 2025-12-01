PS C:\Users\vulin\Desktop\app\Stress_Test\order> k6 run k6-orders-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-orders-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000] ✅ Orders API reachable                        source=console


  █ THRESHOLDS

    errors
    ✓ 'rate<0.1' rate=0.00%

    http_req_duration
    ✗ 'p(95)<600' p(95)=12.01s

    http_req_failed
    ✓ 'rate<0.1' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 6370    17.407804/s
    checks_succeeded...: 100.00% 6370 out of 6370
    checks_failed......: 0.00%   0 out of 6370

    ✓ create 201
    ✓ get 200
    ✓ list 200
    ✓ by customer 200
    ✓ add item 200/201
    ✓ status 200
    ✓ cancel 200

    CUSTOM
    errors.........................: 0.00%  0 out of 910

    HTTP
    http_req_duration..............: avg=2.76s  min=505.29µs med=477.69ms max=46.41s p(90)=7.05s  p(95)=12.01s
      { expected_response:true }...: avg=2.76s  min=505.29µs med=477.69ms max=46.41s p(90)=7.05s  p(95)=12.01s
    http_req_failed................: 0.00%  0 out of 6371
    http_reqs......................: 6371   17.410537/s

    EXECUTION
    iteration_duration.............: avg=20.59s min=1.23s    med=16.92s   max=56.88s p(90)=49.97s p(95)=51.89s
    iterations.....................: 910    2.486829/s
    vus............................: 8      min=1         max=100
    vus_max........................: 100    min=100       max=100

    NETWORK
    data_received..................: 3.2 GB 8.8 MB/s
    data_sent......................: 928 kB 2.5 kB/s



                                                                                           
running (6m05.9s), 000/100 VUs, 910 complete and 0 interrupted iterations                  
default ✓ [======================================] 000/100 VUs  6m0s                       
ERRO[0366] thresholds on metrics 'http_req_duration' have been crossed
PS C:\Users\vulin\Desktop\app\Stress_Test\order> 
 *  History restored 


 PS C:\Users\vulin\Desktop\app\Stress_Test\order> k6 run k6-orders-simple-10vu.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-orders-simple-10vu.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 1m30s max duration (incl. graceful stop):       
              * default: 10 looping VUs for 1m0s (gracefulStop: 30s)

INFO[0000] ✅ Orders API Ready                            source=console


  █ THRESHOLDS

    errors
    ✓ 'rate<0.05' rate=0.00%

    http_req_duration
    ✗ 'p(95)<1000' p(95)=2.02s

    http_req_failed
    ✓ 'rate<0.05' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 1341    21.205304/s
    checks_succeeded...: 100.00% 1341 out of 1341
    checks_failed......: 0.00%   0 out of 1341

    ✓ ✓ Create: 201
    ✓ ✓ Create: has id
    ✓ ✓ Get: 200
    ✓ ✓ Get: correct id
    ✓ ✓ List: 200
    ✓ ✓ Cust: 200
    ✓ ✓ AddItem: 200/201
    ✓ ✓ Status: 200
    ✓ ✓ Cancel: 200

    CUSTOM
    errors.........................: 0.00%  0 out of 149

    HTTP
    http_req_duration..............: avg=459.67ms min=507.7µs med=159.98ms max=3.07s p(90)=1.57s p(95)=2.02s
      { expected_response:true }...: avg=459.67ms min=507.7µs med=159.98ms max=3.07s p(90)=1.57s p(95)=2.02s
    http_req_failed................: 0.00%  0 out of 1044
    http_reqs......................: 1044   16.508827/s

    EXECUTION
    iteration_duration.............: avg=4.22s    min=1.59s   med=4.3s     max=5.43s p(90)=5.21s p(95)=5.28s
    iterations.....................: 149    2.356145/s
    vus............................: 7      min=7         max=10
    vus_max........................: 10     min=10        max=10

    NETWORK
    data_received..................: 593 MB 9.4 MB/s
    data_sent......................: 151 kB 2.4 kB/s



                                                                                                  
running (1m03.2s), 00/10 VUs, 149 complete and 0 interrupted iterations                           
default ✓ [======================================] 10 VUs  1m0s                                   
ERRO[0063] thresholds on metrics 'http_req_duration' have been crossed
