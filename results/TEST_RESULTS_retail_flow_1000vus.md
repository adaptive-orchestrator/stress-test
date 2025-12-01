PS C:\Users\vulin\Desktop\app\Stress_Test\retail-flow> k6 run k6-retail-flow-stress-test.js

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: k6-retail-flow-stress-test.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 6m30s max duration (incl. graceful stop):      
              * default: Up to 100 looping VUs for 6m0s over 7 stages (gracefulRampDown: 30s, gracefulStop: 30s)

INFO[0000]
============================================================  source=console
INFO[0000]    RETAIL FLOW STRESS TEST                    source=console
INFO[0000]    Luồng: Product → Inventory → Order → Payment  source=console
INFO[0000] ============================================================  source=console
INFO[0000] Target API: http://localhost:3000             source=console
INFO[0000] Started at: 2025-11-30T09:51:49.210Z          source=console
INFO[0000] ============================================================  source=console
INFO[0000] ✓ Catalogue API is healthy                    source=console
INFO[0000] ✓ Inventory API is healthy                    source=console
INFO[0000] ✓ Order API is healthy                        source=console
INFO[0000] ✓ Billing API is healthy                      source=console
INFO[0000] ✓ Payment API is healthy                      source=console
INFO[0000] ✓ Customer API is healthy                     source=console                           
INFO[0000] ✓ Found 6 existing customers                  source=console                           
INFO[0000] 📝 Seeding test customers...                   source=console                          
INFO[0000] ✓ Seeded 14 customers. Total: 6               source=console
INFO[0000]                                                                                        
============================================================  source=console                      
INFO[0000]    STARTING TEST...                           source=console                           
INFO[0000] ============================================================  source=console           
INFO[0363]
============================================================  source=console
INFO[0363]    RETAIL FLOW STRESS TEST COMPLETED          source=console                           
INFO[0363] ============================================================  source=console           
INFO[0363] Duration: 362.83s                             source=console                           
INFO[0363] Finished at: 2025-11-30T09:57:52.549Z         source=console                           
INFO[0363] ============================================================  source=console           
INFO[0363]                                                                                        
Check the summary above for detailed metrics:  source=console                                     
INFO[0363] - retail_flow_completed: Số flow hoàn thành   source=console                           
INFO[0363] - retail_flow_failed: Số flow thất bại        source=console                           
INFO[0363] - flow_success_rate: Tỷ lệ thành công         source=console                           
INFO[0363] - step1-4_*_latency: Latency từng bước        source=console                           
INFO[0363] - total_flow_latency: Tổng thời gian flow     source=console                           
INFO[0363] ============================================================  source=console           


  █ THRESHOLDS

    flow_success_rate
    ✓ 'rate>0.80' rate=100.00%

    http_req_duration
    ✓ 'p(95)<8000' p(95)=1.8s

    http_req_failed
    ✓ 'rate<0.15' rate=0.06%

    step1_product_latency
    ✓ 'p(95)<4000' p(95)=517.7

    step2_inventory_latency
    ✓ 'p(95)<5000' p(95)=659.4

    step3_order_latency
    ✓ 'p(95)<10000' p(95)=2545.7

    step4_payment_latency
    ✓ 'p(95)<8000' p(95)=1650.7

    total_flow_latency
    ✓ 'p(95)<40000' p(95)=11434.1


  █ TOTAL RESULTS

    checks_total.......: 29844   82.136914/s
    checks_succeeded...: 100.00% 29844 out of 29844
    checks_failed......: 0.00%   0 out of 29844

    ✓ product created (201)
    ✓ product has id
    ✓ inventory created (201/200)
    ✓ inventory verified
    ✓ order created (201)
    ✓ order has id
    ✓ order confirmed
    ✓ invoice created (201)
    ✓ invoice has id
    ✓ payment initiated (201)
    ✓ payment has id
    ✓ payment confirmed (200)

    CUSTOM
    flow_success_rate..............: 100.00% 2487 out of 2487
    retail_flow_completed..........: 2487    6.844743/s
    step1_product_created..........: 2487    6.844743/s
    step1_product_latency..........: avg=217.773623  min=17      med=154      max=2834  p(90)=378    p(95)=517.7
    step2_inventory_latency........: avg=258.661842  min=19      med=171      max=2855  p(90)=458.4  p(95)=659.4
    step2_inventory_updated........: 2487    6.844743/s
    step3_order_created............: 2487    6.844743/s
    step3_order_latency............: avg=1121.563731 min=78      med=910      max=5405  p(90)=2134.8 p(95)=2545.7
    step4_payment_completed........: 2487    6.844743/s
    step4_payment_latency..........: avg=614.491355  min=43      med=428      max=3276  p(90)=1356   p(95)=1650.7
    total_flow_latency.............: avg=5202.969039 min=451     med=4321     max=18308 p(90)=10036  p(95)=11434.1

    HTTP
    http_req_duration..............: avg=576.67ms    min=508.9µs med=349.16ms max=6.87s p(90)=1.3s   p(95)=1.8s
      { expected_response:true }...: avg=577.03ms    min=4.02ms  med=349.65ms max=6.87s p(90)=1.3s   p(95)=1.8s
    http_req_failed................: 0.06%   14 out of 22404
    http_reqs......................: 22404   61.660482/s

    EXECUTION
    iteration_duration.............: avg=7.2s        min=1.71s   med=6.37s    max=21.1s p(90)=12.17s p(95)=13.69s
    iterations.....................: 2487    6.844743/s
    vus............................: 1       min=1            max=100
    vus_max........................: 100     min=100          max=100

    NETWORK
    data_received..................: 21 MB   59 kB/s
    data_sent......................: 6.0 MB  16 kB/s



                                                                                                  
running (6m03.3s), 000/100 VUs, 2487 complete and 0 interrupted iterations                        
default ✓ [======================================] 000/100 VUs  6m0s     


              
INFO[0681]
============================================================  source=console
INFO[0681]    1000 VUs STRESS TEST COMPLETED             source=console                           
INFO[0681] ============================================================  source=console           
INFO[0681] Duration: 678.71s (11.31 minutes)             source=console                           
INFO[0681] Finished at: 2025-11-30T10:10:56.128Z         source=console                           
INFO[0681] ============================================================  source=console           


  █ THRESHOLDS

    flow_success_rate
    ✓ 'rate>0.60' rate=81.84%

    http_req_duration
    ✗ 'p(95)<2000' p(95)=35.34s

    http_req_failed
    ✓ 'rate<0.25' rate=2.40%

    total_flow_latency
    ✗ 'p(95)<6000' p(95)=124771.35


  █ TOTAL RESULTS

    checks_total.......: 31310  46.002721/s
    checks_succeeded...: 96.96% 30360 out of 31310
    checks_failed......: 3.03%  950 out of 31310

    ✓ product created
    ✓ inventory created
    ✓ order created
    ✗ invoice created
      ↳  82% — ✓ 4408 / ✗ 950
    ✓ payment initiated
    ✓ payment confirmed

    CUSTOM
    flow_success_rate..............: 81.84% 4284 out of 5234
    retail_flow_completed..........: 4284   6.294336/s
    retail_flow_failed.............: 950    1.395803/s
    step1_product_created..........: 5757   8.458565/s
    step1_product_latency..........: avg=2103.415668  min=38    med=813     max=15247  p(90)=5784.8  p(95)=8735.8
    step2_inventory_latency........: avg=2054.979851  min=48    med=994     max=16689  p(90)=5871.2  p(95)=7771.4
    step2_inventory_updated........: 5757   8.458565/s
    step3_order_created............: 5719   8.402733/s
    step3_order_latency............: avg=18307.755202 min=173   med=16758   max=45040  p(90)=36693.4 p(95)=38657.2
    step4_payment_completed........: 4344   6.382492/s
    step4_payment_latency..........: avg=3667.696229  min=117   med=2807    max=12246  p(90)=7538    p(95)=9715.9
    total_flow_latency.............: avg=70743.46389  min=1688  med=75257.5 max=133411 p(90)=121340  p(95)=124771.35

    HTTP
    http_req_duration..............: avg=9.53s        min=0s    med=3.71s   max=1m0s   p(90)=26.6s   p(95)=35.34s
      { expected_response:true }...: avg=8.35s        min=9.1ms med=3.57s   max=59.91s p(90)=25.16s  p(95)=30.72s
    http_req_failed................: 2.40%  994 out of 41322
    http_reqs......................: 41322  60.713013/s

    EXECUTION
    iteration_duration.............: avg=1m11s        min=2.46s med=1m16s   max=2m14s  p(90)=2m2s    p(95)=2m5s
    iterations.....................: 5214   7.660753/s
    vus............................: 80     min=0            max=1000
    vus_max........................: 1000   min=1000         max=1000

    NETWORK
    data_received..................: 36 MB  53 kB/s
    data_sent......................: 12 MB  17 kB/s



                                                                                                  
running (11m20.6s), 0000/1000 VUs, 5214 complete and 543 interrupted iterations                   
default ✓ [======================================] 0000/1000 VUs  11m0s                           
ERRO[0681] thresholds on metrics 'http_req_duration, total_flow_latency' have been crossed        
PS C:\Users\vulin\Desktop\app\Stress_Test\retail-flow> 
 *  History restored 