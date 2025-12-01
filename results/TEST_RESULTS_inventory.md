PS C:\Users\vulin\Desktop\app\Stress_Test\inventory> k6 run k6-inventory-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-inventory-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0001] ✅ Seeded 25 products with inventory for test.  source=console


  █ THRESHOLDS

    http_req_duration
    ✗ 'p(95)<600' p(95)=696.86ms

    http_req_failed
    ✓ 'rate<0.1' rate=9.62%


  █ TOTAL RESULTS

    checks_total.......: 45125   124.626299/s
    checks_succeeded...: 100.00% 45125 out of 45125
    checks_failed......: 0.00%   0 out of 45125

    ✓ list 200
    ✓ get 200/404
    ✓ adjust 200/400
    ✓ reserve 201/400
    ✓ release 200
    ✓ availability 200
    ✓ history 200
    ✓ low 200

    HTTP
    http_req_duration..............: avg=216.85ms min=504.4µs  med=145.25ms max=2.02s p(90)=509.23ms p(95)=696.86ms
      { expected_response:true }...: avg=222.23ms min=504.4µs  med=145.88ms max=2.02s p(90)=532.45ms p(95)=723.81ms
    http_req_failed................: 9.62%  4347 out of 45177
    http_reqs......................: 45177  124.769913/s

    EXECUTION
    iteration_duration.............: avg=2.83s    min=612.26ms med=2.64s    max=7.77s p(90)=4.48s    p(95)=5.06s
    iterations.....................: 6184   17.078981/s
    vus............................: 1      min=0             max=100
    vus_max........................: 100    min=100           max=100

    NETWORK
    data_received..................: 778 MB 2.1 MB/s
    data_sent......................: 5.7 MB 16 kB/s



                                                                                           
running (6m02.1s), 000/100 VUs, 6184 complete and 0 interrupted iterations                 
default ✓ [======================================] 000/100 VUs  6m0s                       
ERRO[0362] thresholds on metrics 'http_req_duration' have been crossed


PS C:\Users\vulin\Desktop\app\Stress_Test\inventory> k6 run k6-inventory-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-inventory-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0001] ✅ Seeded 25 products with inventory for test.  source=console


  █ THRESHOLDS

    http_req_duration
    ✗ 'p(95)<600' p(95)=741.17ms

    http_req_failed
    ✓ 'rate<0.1' rate=9.17%


  █ TOTAL RESULTS

    checks_total.......: 46996   129.559807/s
    checks_succeeded...: 100.00% 46996 out of 46996
    checks_failed......: 0.00%   0 out of 46996

    ✓ list 200
    ✓ get 200/404
    ✓ adjust 200/400
    ✓ reserve 201/400
    ✓ release 200
    ✓ availability 200
    ✓ history 200
    ✓ low 200

    HTTP
    http_req_duration..............: avg=201.55ms min=0s      med=104.86ms max=2.64s p(90)=502.66ms p(95)=741.17ms
      { expected_response:true }...: avg=204.53ms min=0s      med=102.26ms max=2.64s p(90)=526.99ms p(95)=764.78ms
    http_req_failed................: 9.17%  4316 out of 47048
    http_reqs......................: 47048  129.703162/s

    EXECUTION
    iteration_duration.............: avg=2.73s    min=612.6ms med=2.42s    max=7.54s p(90)=4.62s    p(95)=5.28s
    iterations.....................: 6414   17.682284/s
    vus............................: 3      min=0             max=100
    vus_max........................: 100    min=100           max=100

    NETWORK
    data_received..................: 86 MB  237 kB/s
    data_sent......................: 5.9 MB 16 kB/s



                                                                                           
running (6m02.7s), 000/100 VUs, 6414 complete and 0 interrupted iterations                 
default ✓ [======================================] 000/100 VUs  6m0s                       
ERRO[0363] thresholds on metrics 'http_req_duration' have been crossed
PS C:\Users\vulin\Desktop\app\Stress_Test\inventory> k6 run k6-inventory-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-inventory-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0001] ✅ Seeded 25 products with inventory for test.  source=console


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<1000' p(95)=634.15ms

    http_req_failed
    ✓ 'rate<0.1' rate=9.99%


  █ TOTAL RESULTS

    checks_total.......: 48662  133.973006/s
    checks_succeeded...: 99.98% 48653 out of 48662
    checks_failed......: 0.01%  9 out of 48662

    ✓ list 200
    ✓ get 200/404
    ✗ adjust 200/400
      ↳  99% — ✓ 6681 / ✗ 9
    ✓ reserve 201/400
    ✓ release 200
    ✓ availability 200
    ✓ history 200
    ✓ low 200

    HTTP
    http_req_duration..............: avg=186.15ms min=0s       med=114ms    max=2s    p(90)=449.83ms p(95)=634.15ms
      { expected_response:true }...: avg=189.42ms min=0s       med=111.72ms max=2s    p(90)=470.02ms p(95)=655.41ms
    http_req_failed................: 9.99%  4867 out of 48714
    http_reqs......................: 48714  134.116169/s

    EXECUTION
    iteration_duration.............: avg=2.61s    min=611.89ms med=2.45s    max=5.69s p(90)=4.15s    p(95)=4.54s
    iterations.....................: 6690   18.418466/s
    vus............................: 1      min=0             max=100
    vus_max........................: 100    min=100           max=100

    NETWORK
    data_received..................: 90 MB  247 kB/s
    data_sent......................: 6.1 MB 17 kB/s



                                                                                           
running (6m03.2s), 000/100 VUs, 6690 complete and 0 interrupted iterations                 
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\inventory> k6 run k6-inventory-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-inventory-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0001] ✅ Seeded 25 products with inventory for test.  source=console


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<1000' p(95)=708.05ms

    http_req_failed
    ✓ 'rate<0.1' rate=9.31%


  █ TOTAL RESULTS

    checks_total.......: 48048  132.643227/s
    checks_succeeded...: 99.99% 48047 out of 48048
    checks_failed......: 0.00%  1 out of 48048

    ✓ list 200
    ✓ get 200/404
    ✗ adjust 200/400
      ↳  99% — ✓ 6565 / ✗ 1
    ✓ reserve 201/400
    ✓ release 200
    ✓ availability 200
    ✓ history 200
    ✓ low 200

    HTTP
    http_req_duration..............: avg=192.92ms min=0s       med=109.35ms max=4s   p(90)=461.96ms p(95)=708.05ms
      { expected_response:true }...: avg=195.79ms min=0s       med=106.32ms max=4s   p(90)=480.78ms p(95)=730.8ms
    http_req_failed................: 9.31%  4481 out of 48100
    http_reqs......................: 48100  132.786781/s

    EXECUTION
    iteration_duration.............: avg=2.67s    min=667.75ms med=2.41s    max=8.3s p(90)=4.3s     p(95)=4.89s
    iterations.....................: 6566   18.126362/s
    vus............................: 2      min=0             max=100
    vus_max........................: 100    min=100           max=100

    NETWORK
    data_received..................: 88 MB  244 kB/s
    data_sent......................: 6.1 MB 17 kB/s



                                                                                           
running (6m02.2s), 000/100 VUs, 6566 complete and 0 interrupted iterations                 
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\inventory> k6 run k6-inventory-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-inventory-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0001] ✅ Seeded 25 products with inventory for test.  source=console

running (1m17.1s), 010/100 VUs, 408 complete and 0 interrupted iterations
default   [======>-------------------------------] 010/100 VUs  1m15.6s/6m00.0s





                    
PS C:\Users\vulin\Desktop\app\Stress_Test\inventory> k6 run k6-inventory-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-inventory-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0001] ✅ Seeded 25 products with inventory for test.  source=console


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<1000' p(95)=611.55ms

    http_req_failed
    ✓ 'rate<0.1' rate=9.94%


  █ TOTAL RESULTS

    checks_total.......: 51541   142.3569/s
    checks_succeeded...: 100.00% 51541 out of 51541
    checks_failed......: 0.00%   0 out of 51541

    ✓ list 200
    ✓ get 200/404
    ✓ adjust 200/400
    ✓ reserve 201/400
    ✓ release 200
    ✓ availability 200
    ✓ history 200
    ✓ low 200

    HTTP
    http_req_duration..............: avg=166.04ms min=0s       med=93.8ms  max=2.05s p(90)=399.48ms p(95)=611.55ms
      { expected_response:true }...: avg=169ms    min=0s       med=91.98ms max=2.05s p(90)=416.62ms p(95)=637.97ms
    http_req_failed................: 9.94%  5131 out of 51593
    http_reqs......................: 51593  142.500525/s

    EXECUTION
    iteration_duration.............: avg=2.47s    min=613.01ms med=2.25s   max=5.96s p(90)=4.03s    p(95)=4.46s
    iterations.....................: 7084   19.566098/s
    vus............................: 1      min=0             max=100
    vus_max........................: 100    min=100           max=100

    NETWORK
    data_received..................: 95 MB  263 kB/s
    data_sent......................: 6.5 MB 18 kB/s



                                                                                           
running (6m02.1s), 000/100 VUs, 7084 complete and 0 interrupted iterations                 
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\inventory> 