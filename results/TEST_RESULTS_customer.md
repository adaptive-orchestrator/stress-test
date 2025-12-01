
PS C:\Users\vulin\Desktop\app\Stress_Test\customer> k6 run k6-customer-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-customer-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000] Setup: Found 10 emails and 10 IDs             source=console


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<600' p(95)=184.3ms

    http_req_failed
    ✓ 'rate<0.05' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 58775   162.712784/s
    checks_succeeded...: 100.00% 58775 out of 58775
    checks_failed......: 0.00%   0 out of 58775

    ✓ List: 200
    ✓ Get: 200
    ✓ Email: 200
    ✓ Insights: 200
    ✓ Thresholds: 200

    HTTP
    http_req_duration..............: avg=48.09ms min=0s       med=10.26ms max=756.8ms p(90)=129.43ms p(95)=184.3ms
      { expected_response:true }...: avg=48.09ms min=0s       med=10.26ms max=756.8ms p(90)=129.43ms p(95)=184.3ms
    http_req_failed................: 0.00%  0 out of 58776
    http_reqs......................: 58776  162.715552/s

    EXECUTION
    iteration_duration.............: avg=1.48s   min=520.06ms med=1.47s   max=3.6s    p(90)=2.17s    p(95)=2.35s
    iterations.....................: 11755  32.542557/s
    vus............................: 1      min=1          max=100
    vus_max........................: 100    min=100        max=100

    NETWORK
    data_received..................: 70 MB  192 kB/s
    data_sent......................: 5.5 MB 15 kB/s



                                                                                           
running (6m01.2s), 000/100 VUs, 11755 complete and 0 interrupted iterations                
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\customer> 

PS C:\Users\vulin\Desktop\app\Stress_Test\customer> k6 run k6-customer-simple-10vu.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-customer-simple-10vu.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 1m30s max duration (incl. graceful stop) 
              * default: 10 looping VUs for 1m0s (gracefulStop: 30s)

INFO[0000] ✅ Customers API Ready - Found 10 emails and 10 IDs  source=console


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<1000' p(95)=31.28ms

    http_req_failed
    ✓ 'rate<0.05' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 2256    37.320775/s
    checks_succeeded...: 100.00% 2256 out of 2256
    checks_failed......: 0.00%   0 out of 2256

    ✓ ✓ List: 200
    ✓ ✓ Get: 200
    ✓ ✓ Email: 200
    ✓ ✓ Segments: 200

    HTTP
    http_req_duration..............: avg=17.48ms min=0s med=16.91ms max=136.13ms p(90)=27.94ms p(95)=31.28ms
      { expected_response:true }...: avg=17.48ms min=0s med=16.91ms max=136.13ms p(90)=27.94ms p(95)=31.28ms
    http_req_failed................: 0.00%  0 out of 2257
    http_reqs......................: 2257   37.337318/s

    EXECUTION
    iteration_duration.............: avg=1.07s   min=1s med=1.06s   max=1.38s    p(90)=1.09s   p(95)=1.1s
    iterations.....................: 564    9.330194/s
    vus............................: 10     min=10        max=10
    vus_max........................: 10     min=10        max=10

    NETWORK
    data_received..................: 2.9 MB 48 kB/s
    data_sent......................: 212 kB 3.5 kB/s



                                                                                           
running (1m00.4s), 00/10 VUs, 564 complete and 0 interrupted iterations                    
default ✓ [======================================] 10 VUs  1m0s                            
PS C:\Users\vulin\Desktop\app\Stress_Test\customer> 