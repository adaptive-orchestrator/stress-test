PS C:\Users\vulin\Desktop\app\Stress_Test\addon> k6 run k6-addon-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-addon-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000] Setup complete: undefined addons, undefined user addons  source=console


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<700' p(95)=370.97ms

    http_req_failed
    ✓ 'rate<0.1' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 41658   115.370622/s
    checks_succeeded...: 100.00% 41658 out of 41658
    checks_failed......: 0.00%   0 out of 41658

    ✓ list 200
    ✓ get 200
    ✓ purchase 200/400
    ✓ user 200
    ✓ cancel 200

    HTTP
    http_req_duration..............: avg=87.43ms min=0s       med=32.48ms max=1.89s p(90)=238.46ms p(95)=370.97ms
      { expected_response:true }...: avg=87.43ms min=0s       med=32.48ms max=1.89s p(90)=238.46ms p(95)=370.97ms
    http_req_failed................: 0.00%  0 out of 41661
    http_reqs......................: 41661  115.37893/s

    EXECUTION
    iteration_duration.............: avg=1.57s   min=514.04ms med=1.52s   max=5.18s p(90)=2.35s    p(95)=2.81s
    iterations.....................: 11062  30.635888/s
    vus............................: 1      min=1          max=100
    vus_max........................: 100    min=100        max=100

    NETWORK
    data_received..................: 40 MB  110 kB/s
    data_sent......................: 4.7 MB 13 kB/s



                                                                                           
running (6m01.1s), 000/100 VUs, 11062 complete and 0 interrupted iterations                
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\addon> 


01/12

PS C:\Users\vulin\Desktop\app\Stress_Test\addon> k6 run k6-addon-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-addon-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000] Setup complete: undefined addons, undefined user addons  source=console  


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<700' p(95)=10.08ms

    http_req_failed
    ✓ 'rate<0.1' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 27614   76.468164/s
    checks_succeeded...: 100.00% 27614 out of 27614
    checks_failed......: 0.00%   0 out of 27614

    ✓ list 200
    ✓ user 200

    HTTP
    http_req_duration..............: avg=4.92ms min=0s      med=4.41ms max=88.26ms p(90)=8.57ms p(95)=10.08ms
      { expected_response:true }...: avg=4.92ms min=0s      med=4.41ms max=88.26ms p(90)=8.57ms p(95)=10.08ms
    http_req_failed................: 0.00%  0 out of 27617
    http_reqs......................: 27617  76.476471/s

    EXECUTION
    iteration_duration.............: avg=1.26s  min=506.8ms med=1.26s  max=2.01s   p(90)=1.86s  p(95)=1.93s
    iterations.....................: 13807  38.234082/s
    vus............................: 1      min=1          max=100
    vus_max........................: 100    min=100        max=100

    NETWORK
    data_received..................: 9.6 MB 27 kB/s
    data_sent......................: 2.6 MB 7.3 kB/s



                                                                                    
running (6m01.1s), 000/100 VUs, 13807 complete and 0 interrupted iterations         
default ✓ [======================================] 000/100 VUs  6m0s                
PS C:\Users\vulin\Desktop\app\Stress_Test\addon> 