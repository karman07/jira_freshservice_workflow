# 🧪 Testing Guide: Jira ↔ Freshservice Sync

This guide explains how to test the integration using Postman and simulate webhook events.

## 1. Prerequisites
- Ensure the server is running (`npm run start:dev`)
- Ensure MongoDB is running locally or accessible via your `.env` connection string.
- Import the `Jira-Freshservice-Sync.postman_collection.json` file into Postman.

## 2. Server Setup
If you see an `EADDRINUSE` error on port 3000, you have two options:
1. **Kill the existing process**:
   ```bash
   lsof -i :3000
   kill -9 <PID>
   ```
2. **Change the port** in your `.env` file:
   ```env
   PORT=3001
   ```
   *Note: If you change the port, update the `BASE_URL` variable in the Postman collection to `http://localhost:3001/api`.*

## 3. Using Postman
The collection contains two main folders:

### A. Jira Webhooks (`/api/webhook/jira`)
- **Jira: Issue Created**: Simulates a new issue being created in Jira.
- **Jira: Comment Created**: Simulates a new comment being added to an existing Jira issue.

### B. Freshservice Webhooks (`/api/webhook/freshservice`)
- **FS: Ticket Created**: Simulates a new ticket being created in Freshservice.
- **FS: Note Created**: Simulates a new note being added to a Freshservice ticket.

## 4. Expected Results (Current State)
Since we are currently at **Step 2**, the controllers are just "stubs".
- **Response**: You should receive a `200 OK` with `{ "received": true }`.
- **Console**: You should see the NestJS startup logs.

As we progress through the steps:
- **Step 4**: Validation will be added (you'll get `400 Bad Request` if the payload is wrong).
- **Step 7**: Real sync logic will trigger, and you'll see logs in MongoDB.
- **Step 9**: Detailed logs will be available in the `sync_logs` collection.

---

## 5. Summary of Endpoints
| System | Method | Endpoint | Trigger Event |
|---|---|---|---|
| **Jira** | POST | `/api/webhook/jira` | `jira:issue_created`, `comment_created` |
| **Freshservice** | POST | `/api/webhook/freshservice` | `ticket_created`, `note_created` |
