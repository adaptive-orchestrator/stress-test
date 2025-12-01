
PS C:\Users\vulin\Desktop\app\Stress_Test\Catalogue> k6 run k6-simple-10vu.js              

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-simple-10vu.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 1m30s max duration (incl. graceful stop) 
              * default: 10 looping VUs for 1m0s (gracefulStop: 30s)

INFO[0000] 🚀 Simple 10 VU Catalogue Test                 source=console
INFO[0000] ✅ API Ready - Starting test with 10 parallel users  source=console


  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<1000' p(95)=113.52ms

    http_req_failed
    ✓ 'rate<0.05' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 4653    76.180904/s
    checks_succeeded...: 100.00% 4653 out of 4653
    checks_failed......: 0.00%   0 out of 4653

    ✓ ✓ Create: status 201
    ✓ ✓ Create: has product
    ✓ ✓ Get: status 200
    ✓ ✓ Get: correct product
    ✓ ✓ List: status 200
    ✓ ✓ List: returns array
    ✓ ✓ List: has pagination
    ✓ ✓ Update: status 200
    ✓ ✓ Update: price changed

    CUSTOM
    errors.........................: 0.00%  0 out of 517

    HTTP
    http_req_duration..............: avg=43.71ms min=614.4µs med=36ms  max=335.68ms p(90)=81.18ms p(95)=113.52ms
      { expected_response:true }...: avg=43.71ms min=614.4µs med=36ms  max=335.68ms p(90)=81.18ms p(95)=113.52ms
    http_req_failed................: 0.00%  0 out of 2069
    http_reqs......................: 2069   33.874552/s

    EXECUTION
    iteration_duration.............: avg=1.17s   min=1.06s   med=1.14s max=1.55s    p(90)=1.33s   p(95)=1.4s
    iterations.....................: 517    8.464545/s
    vus............................: 7      min=7         max=10
    vus_max........................: 10     min=10        max=10

    NETWORK
    data_received..................: 5.2 MB 85 kB/s
    data_sent......................: 501 kB 8.2 kB/s



                                                                                           
running (1m01.1s), 00/10 VUs, 517 complete and 0 interrupted iterations                    
default ✓ [======================================] 10 VUs  1m0s                            
PS C:\Users\vulin\Desktop\app\Stress_Test\Catalogue> 



PS C:\Users\vulin\Desktop\app\Stress_Test\Catalogue> k6 run k6-catalogue-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
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
WARN[0236] The test has generated metrics with 100008 unique time series, which is higher than the suggested limit of 100000 and could cause high memory usage. Consider not using high-cardinality values like unique IDs as metric tags or, if you need them in the URL, use the name metric tag or URL grouping. See https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/ for details.  component=metrics-engine-ingester
WARN[0333] The test has generated metrics with 200160 unique time series, which is higher than the suggested limit of 100000 and could cause high memory usage. Consider not using high-cardinality values like unique IDs as metric tags or, if you need them in the URL, use the name metric tag or URL grouping. See https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/ for details.  component=metrics-engine-ingester
INFO[0360] ✅ Test completed at: 2025-12-01T01:04:44.618Z  source=console
INFO[0360] 📊 Check the summary above for detailed metrics  source=console                 
INFO[0360]                                                                                 
============================================================  source=console               
INFO[0360] 🎯 K8S RESOURCE RECOMMENDATIONS                source=console                   
INFO[0360] ============================================================  source=console    
INFO[0360] Service: catalogue-svc                        source=console                    
INFO[0360] Replicas: 4                                   source=console                    
INFO[0360] CPU Request: 100m                             source=console                    
INFO[0360] CPU Limit: 500m                               source=console                    
INFO[0360] Memory Request: 128Mi                         source=console                    
INFO[0360] Memory Limit: 512Mi                           source=console                    
INFO[0360]                                                                                 
📋 YAML Configuration:                        source=console                               
INFO[0360] ```yaml                                       source=console                    
INFO[0360] replicas: 4                                   source=console                    
INFO[0360] resources:                                    source=console                    
INFO[0360]   requests:                                   source=console                    
INFO[0360]     cpu: "100m"                               source=console                    
INFO[0360]     memory: "128Mi"                           source=console                    
INFO[0360]   limits:                                     source=console                    
INFO[0360]     cpu: "500m"                               source=console                    
INFO[0360]     memory: "512Mi"                           source=console                    
INFO[0360] ```                                           source=console                    
INFO[0360] ============================================================  source=console    
                                                                                           
running (6m00.6s), 000/100 VUs, 11915 complete and 0 interrupted iterations                
default ✓ [======================================] 000/100 VUs  6m0s                       
PS C:\Users\vulin\Desktop\app\Stress_Test\Catalogue> 