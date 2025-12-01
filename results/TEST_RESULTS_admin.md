C:\Users\vulin\Desktop\app\Stress_Test\admin> k6 run k6-admin-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-admin-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)



  █ TOTAL RESULTS

    checks_total.......: 34742   96.349794/s
    checks_succeeded...: 100.00% 34742 out of 34742
    checks_failed......: 0.00%   0 out of 34742

    ✓ dashboard 200/401/403
    ✓ revenue 200/401/403

    HTTP
    http_req_duration....: avg=1.4ms min=0s med=1.06ms max=70.27ms p(90)=2.47ms p(95)=3.52ms
    http_req_failed......: 100.00% 34743 out of 34743
    http_reqs............: 34743   96.352567/s

    EXECUTION
    iteration_duration...: avg=1s    min=1s med=1s     max=1.07s   p(90)=1s     p(95)=1s   

    iterations...........: 17371   48.174897/s
    vus..................: 2       min=1              max=100
    vus_max..............: 100     min=100            max=100

    NETWORK
    data_received........: 12 MB   33 kB/s
    data_sent............: 3.1 MB  8.7 kB/s



                                                                                           
running (6m00.6s), 000/100 VUs, 17371 complete and 0 interrupted iterations                
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\admin> 

