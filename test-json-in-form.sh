curl -X POST http://localhost:3000/api/webhook/freshservice -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode '{"event_type":"ticket_created","ticket":{"id":6789}}=' -v
