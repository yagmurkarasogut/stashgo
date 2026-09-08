#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  TRACE production-readiness (scope freeze). This iteration: complete TR/EN localization,
  new auth account flows (change password, forgot/reset via email, real account deletion,
  admin role), Settings screen, legal pages. Do not break existing Trace features.

backend:
  - task: "Auth: change password"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/auth/change-password verifies current pw, updates hash, revokes sessions. curl-verified old pw rejected."
  - task: "Auth: forgot/reset password via email (Emergent Resend)"
    implemented: true
    working: true
    file: "backend/server.py, backend/services/email.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/auth/forgot-password (non-enumerating, emails 6-digit code, 15min expiry, bcrypt-hashed) + POST /api/auth/reset-password (verifies code, updates pw, revokes sessions). Email delivery verified via delivered@resend.dev (id returned). Wrong code -> 400."
  - task: "Auth: real account deletion (KVKK)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "DELETE /api/auth/account soft-deletes+anonymizes PII, purges library/lists/discoveries, revokes sessions. Login blocked after; email freed for re-register. curl-verified."
  - task: "Admin role field + seed"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "users.role added (default user). Startup seeds admin for yagmurkarasogut@gmail.com. UserPublic returns role."

frontend:
  - task: "Centralized TR/EN i18n across all screens"
    implemented: true
    working: "NA"
    file: "frontend/src/i18n/*, all screens"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "I18nProvider (device-locale default, persisted). Localized: tabs, login, register, onboarding (exact provided TR copy), home, library, lists, search, profile, settings, add-discovery, movie detail, list detail, list new. Needs QA that switching to TR leaves no English on these screens."
  - task: "Settings screen + Forgot password + Legal pages"
    implemented: true
    working: "NA"
    file: "frontend/app/settings.tsx, (auth)/forgot.tsx, legal/[doc].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Settings: language, change password, legal links, delete-account (exact TR confirm copy). Forgot: 2-step email->code+newpass. Legal: bilingual Terms + Privacy/KVKK screens."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 9

test_plan:
  current_focus:
    - "Auth: forgot/reset password via email (Emergent Resend)"
    - "Auth: real account deletion (KVKK)"
    - "Centralized TR/EN i18n across all screens"
    - "Settings screen + Forgot password + Legal pages"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Please regression-test existing Trace flows PLUS the new work.
      BACKEND (high): /api/auth/change-password, /api/auth/forgot-password (returns ok even for
      unknown email; sends code for real email accounts), /api/auth/reset-password (wrong/expired
      code -> 400, valid code -> updates pw and revokes sessions), DELETE /api/auth/account (login
      blocked after deletion, email reusable). Existing: register, login, discoveries analysis+autosave,
      library filters/sort/genre, collections CRUD + batch add, semantic search.
      FRONTEND (high): app boots; onboarding shows exact TR copy when language=TR; Settings language
      toggle switches UI TR/EN with NO leftover English on core screens; change-password from Settings;
      forgot-password 2-step screen; legal Terms + Privacy/KVKK open; account deletion confirm flow.
      Note new backend endpoints require no user credentials (Emergent email key already in .env).
      Test credentials in /app/memory/test_credentials.md.
