// ============================================================
// HOPICS Referral Management — Google Apps Script
// ============================================================
// Setup:
//   1. Create a Google Sheet
//   2. Extensions > Apps Script — paste this code
//   3. Deploy as web app (Execute as: Me, Who has access: Anyone)
//   4. Copy the web app URL into your HTML pages
//   5. To enable daily overdue emails: run setupDailyTrigger() once
// ============================================================

var SUPERVISOR_EMAIL = 'anissacd@gmail.com';

// ── Sheet Column Definitions ─────────────────────────────────
// Referrals (16 cols):
//   ID | Timestamp | HMIS ID | Client Name | DOB | Is Existing Client |
//   From Program | To Program | How Found | Service Category | Urgency |
//   Submitted By | Staff Email | Assessment Notes | Status | Last Updated
var REFERRAL_HEADERS = [
  'ID', 'Timestamp', 'HMIS ID', 'Client Name', 'DOB', 'Is Existing Client',
  'From Program', 'To Program', 'How Found', 'Service Category', 'Urgency',
  'Submitted By', 'Staff Email', 'Assessment Notes', 'Status', 'Last Updated'
];

// Clients (8 cols):
//   HMIS ID | Name | DOB | Date Added | Status | Case Manager |
//   Total Referrals | Last Activity
var CLIENT_HEADERS = [
  'HMIS ID', 'Name', 'DOB', 'Date Added', 'Status',
  'Case Manager', 'Total Referrals', 'Last Activity'
];

// Messages (8 cols):
//   Message ID | Thread ID | Thread Type | Timestamp |
//   From | To | Message | Is Read
var MESSAGE_HEADERS = [
  'Message ID', 'Thread ID', 'Thread Type', 'Timestamp',
  'From', 'To', 'Message', 'Is Read'
];

// Users (8 cols):
//   Email | Name | Role | Status | Program | Date Added | Last Login | Added By
var USER_HEADERS = [
  'Email', 'Name', 'Role', 'Status', 'Program', 'Date Added', 'Last Login', 'Added By'
];

// Goals (11 cols):
//   Goal ID | HMIS ID | Client Name | Goal Description | Target Date |
//   Status | Priority | Created By | Staff Email | Date Created | Last Updated
var GOAL_HEADERS = [
  'Goal ID', 'HMIS ID', 'Client Name', 'Goal Description', 'Target Date',
  'Status', 'Priority', 'Created By', 'Staff Email', 'Date Created', 'Last Updated'
];

// Case Notes (8 cols):
//   Note ID | HMIS ID | Client Name | Note | Note Type |
//   Created By | Staff Email | Date Created
var CASE_NOTE_HEADERS = [
  'Note ID', 'HMIS ID', 'Client Name', 'Note', 'Note Type',
  'Created By', 'Staff Email', 'Date Created'
];

// Programs (9 cols):
//   Program ID | Program Name | Category | Description |
//   Address | Phone | Contact Name | Status | Date Added
var PROGRAM_HEADERS = [
  'Program ID', 'Program Name', 'Category', 'Description',
  'Address', 'Phone', 'Contact Name', 'Status', 'Date Added'
];

// Activity Log (8 cols) — system-wide events (users, roles, messages, goals, etc.):
//   Log ID | Timestamp | User Email | User Name |
//   Action | Target Type | Target ID | Details
var ACTIVITY_LOG_HEADERS = [
  'Log ID', 'Timestamp', 'User Email', 'User Name',
  'Action', 'Target Type', 'Target ID', 'Details'
];

// Referral Updates (10 cols) — referral-specific change history only:
//   Update ID | Timestamp | Referral ID | HMIS ID | Client Name |
//   Action | Old Status | New Status | Changed By | Staff Email
var REFERRAL_UPDATE_HEADERS = [
  'Update ID', 'Timestamp', 'Referral ID', 'HMIS ID', 'Client Name',
  'Action', 'Old Status', 'New Status', 'Changed By', 'Staff Email'
];

// Outcomes (10 cols):
//   Outcome ID | Referral ID | HMIS ID | Client Name | Outcome |
//   Housing Type | Date Achieved | Notes | Recorded By | Staff Email
var OUTCOME_HEADERS = [
  'Outcome ID', 'Referral ID', 'HMIS ID', 'Client Name', 'Outcome',
  'Housing Type', 'Date Achieved', 'Notes', 'Recorded By', 'Staff Email'
];

// ── Sheet Initialisation ─────────────────────────────────────
function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheetsConfig = [
    { name: 'Referrals',    headers: REFERRAL_HEADERS    },
    { name: 'Clients',      headers: CLIENT_HEADERS      },
    { name: 'Messages',     headers: MESSAGE_HEADERS     },
    { name: 'Users',        headers: USER_HEADERS        },
    { name: 'Goals',        headers: GOAL_HEADERS        },
    { name: 'Case Notes',   headers: CASE_NOTE_HEADERS   },
    { name: 'Programs',     headers: PROGRAM_HEADERS     },
    { name: 'Activity Log',     headers: ACTIVITY_LOG_HEADERS    },
    { name: 'Referral Updates', headers: REFERRAL_UPDATE_HEADERS },
    { name: 'Outcomes',         headers: OUTCOME_HEADERS         }
  ];

  sheetsConfig.forEach(function(cfg) {
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet) {
      sheet = ss.insertSheet(cfg.name);
      sheet.appendRow(cfg.headers);
      Logger.log(cfg.name + ' sheet created with headers');
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────
function safeCallbackName(name) {
  if (!name) return null;
  return /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(name) ? name : null;
}

function createJsonOutput(data, callback) {
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(data) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Activity Logger ───────────────────────────────────────────
function logActivity(userEmail, userName, action, targetType, targetId, details) {
  try {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Activity Log');
    if (!sheet) return;
    var logId = 'LOG_' + new Date().getTime();
    sheet.appendRow([
      logId,
      new Date(),
      userEmail  || '',
      userName   || '',
      action     || '',
      targetType || '',
      targetId   || '',
      details    || ''
    ]);
  } catch (e) {
    Logger.log('logActivity error: ' + e.toString());
  }
}

// ── Referral Update Logger ────────────────────────────────────
function logReferralUpdate(referralId, hmisId, clientName, action, oldStatus, newStatus, changedBy, staffEmail) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Referral Updates');
    if (!sheet) return;
    var updateId = 'RU_' + new Date().getTime();
    sheet.appendRow([
      updateId,
      new Date(),
      referralId  || '',
      hmisId      || '',
      clientName  || '',
      action      || '',
      oldStatus   || '',
      newStatus   || '',
      changedBy   || '',
      staffEmail  || ''
    ]);
  } catch (e) {
    Logger.log('logReferralUpdate error: ' + e.toString());
  }
}

// ── doPost ───────────────────────────────────────────────────
function doPost(e) {
  try {
    Logger.log('doPost called: ' + JSON.stringify(e.parameter));

    var data = e.parameter;

    if (data.action === 'newMessage')      return handleNewMessage(data);
    if (data.action === 'newUser')         return handleNewUser(data);
    if (data.action === 'updateUserRole')  return handleUpdateUserRole(data);
    if (data.action === 'addGoal')         return handleAddGoal(data);
    if (data.action === 'updateGoal')      return handleUpdateGoal(data);
    if (data.action === 'addCaseNote')     return handleAddCaseNote(data);
    if (data.action === 'addProgram')      return handleAddProgram(data);
    if (data.action === 'addOutcome')         return handleAddOutcome(data);
    if (data.action === 'deleteReferral')     return handleDeleteReferral(data);
    if (data.action === 'updateProgram')      return handleUpdateProgram(data);
    if (data.action === 'deleteProgram')      return handleDeleteProgram(data);
    if (data.action === 'updateUserProgram')  return handleUpdateUserProgram(data);
    if (data.action === 'deleteThread')       return handleDeleteThread(data);
    if (data.action === 'updateClient')       return handleUpdateClient(data);
    if (data.id)                              return handleEdit(data);

    return handleNewReferral(data);
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return createJsonOutput({ success: false, message: error.toString() });
  }
}

// ── doGet ────────────────────────────────────────────────────
function doGet(e) {
  var params   = e.parameter || {};
  var action   = params.action || '';
  var callback = safeCallbackName(params.callback);

  // ── Verify user access ────────────────────────────────────
  if (action === 'verifyUser') {
    var email = params.email || '';
    if (!email) {
      return createJsonOutput({ authorized: false, message: 'No email provided.' }, callback);
    }

    var result = getUserRecord(email);
    if (result && String(result.status).toLowerCase() === 'active') {
      updateLastLogin(email);
      return createJsonOutput({
        authorized: true,
        role:    result.role    || 'case_manager',
        name:    result.name    || '',
        program: result.program || ''
      }, callback);
    }

    return createJsonOutput({ authorized: false }, callback);
  }

  if (action === 'listUsers') {
    return createJsonOutput({ success: true, users: getUsersFromSheet() }, callback);
  }

  if (action === 'listReferrals') {
    var referrals = getReferralsFromSheet();
    if (params.hmisId) {
      var filterHmis = String(params.hmisId).toLowerCase();
      referrals = referrals.filter(function(r) {
        return String(r.hmisId || '').toLowerCase() === filterHmis;
      });
    } else if (params.program) {
      // Filter by assigned program — matches fromProgram OR toProgram
      var filterProg = params.program.toLowerCase();
      referrals = referrals.filter(function(r) {
        return String(r.fromProgram || '').toLowerCase() === filterProg ||
               String(r.toProgram   || '').toLowerCase() === filterProg;
      });
    } else if (params.staffEmail) {
      var filterEmail = params.staffEmail.toLowerCase();
      referrals = referrals.filter(function(r) {
        return String(r.staffEmail || '').toLowerCase() === filterEmail;
      });
    }
    return createJsonOutput({ success: true, referrals: referrals }, callback);
  }

  if (action === 'listClients') {
    return createJsonOutput({ success: true, clients: getClientsFromSheet() }, callback);
  }

  if (action === 'getMessages') {
    return createJsonOutput({ success: true, messages: getMessagesFromSheet(params.thread || '') }, callback);
  }

  if (action === 'getThreads') {
    return createJsonOutput({ success: true, threads: getThreadsFromSheet(params.user || '') }, callback);
  }

  if (action === 'listGoals') {
    return createJsonOutput({ success: true, goals: getGoalsFromSheet(params.hmisId || '') }, callback);
  }

  if (action === 'listCaseNotes') {
    return createJsonOutput({ success: true, notes: getCaseNotesFromSheet(params.hmisId || '') }, callback);
  }

  if (action === 'listPrograms') {
    return createJsonOutput({ success: true, programs: getProgramsFromSheet() }, callback);
  }

  if (action === 'listOutcomes') {
    return createJsonOutput({ success: true, outcomes: getOutcomesFromSheet(params.referralId || '', params.hmisId || '') }, callback);
  }

  if (action === 'listActivityLog') {
    return createJsonOutput({ success: true, logs: getActivityLogFromSheet(params.limit || 100) }, callback);
  }

  if (action === 'listReferralUpdates') {
    return createJsonOutput({ success: true, updates: getReferralUpdatesFromSheet(params.referralId || '', params.limit || 200) }, callback);
  }

  return createJsonOutput({ success: true, message: 'HOPICS Google Apps Script is running.' }, callback);
}

// ── handleNewReferral ─────────────────────────────────────────
// Referrals cols (0-based):
//  [0]ID [1]Timestamp [2]HMIS ID [3]Client Name [4]DOB [5]Is Existing
//  [6]From Program [7]To Program [8]How Found [9]Service Category [10]Urgency
//  [11]Submitted By [12]Staff Email [13]Assessment Notes [14]Status [15]Last Updated
function handleNewReferral(data) {
  var ss             = SpreadsheetApp.getActiveSpreadsheet();
  var referralsSheet = ss.getSheetByName('Referrals');
  var clientsSheet   = ss.getSheetByName('Clients');

  var id  = 'REF_' + new Date().getTime();
  var now = new Date();

  var hmisId = data.hmisId || '';
  var isNew  = !data.isExistingClient || data.isExistingClient === 'false';

  referralsSheet.appendRow([
    id,                               // [0]  ID
    now,                              // [1]  Timestamp
    hmisId,                           // [2]  HMIS ID
    data.clientName        || '',     // [3]  Client Name
    data.clientDOB         || '',     // [4]  DOB
    isNew ? 'No' : 'Yes',             // [5]  Is Existing Client
    data.fromProgram       || '',     // [6]  From Program
    data.toProgram         || '',     // [7]  To Program
    data.referralSource    || '',     // [8]  How Found
    data.serviceCategory   || '',     // [9]  Service Category
    data.urgency           || '',     // [10] Urgency
    data.submittedBy       || '',     // [11] Submitted By (staff name)
    data.staffEmail        || '',     // [12] Staff Email
    data.assessmentNotes   || '',     // [13] Assessment Notes
    'pending',                        // [14] Status
    now                               // [15] Last Updated
  ]);

  // Create or update client record
  upsertClient(clientsSheet, {
    hmisId:      hmisId,
    name:        data.clientName  || '',
    dob:         data.clientDOB   || '',
    dateAdded:   now,
    status:      'Active',
    caseManager: data.submittedBy || '',
    lastActivity: now
  });

  // Log referral update
  logReferralUpdate(id, hmisId, data.clientName, 'Created', '', 'pending', data.submittedBy, data.staffEmail);

  // Email supervisor on new referral
  if (SUPERVISOR_EMAIL) {
    sendNewReferralEmail(SUPERVISOR_EMAIL, {
      referralId:      id,
      hmisId:          hmisId,
      clientName:      data.clientName      || '',
      dob:             data.clientDOB       || '',
      fromProgram:     data.fromProgram     || '',
      toProgram:       data.toProgram       || '',
      howFound:        data.referralSource  || '',
      serviceCategory: data.serviceCategory || '',
      urgency:         data.urgency         || '',
      submittedBy:     data.submittedBy     || '',
      staffEmail:      data.staffEmail      || '',
      assessmentNotes: data.assessmentNotes || ''
    });
  }

  return createJsonOutput({ success: true, message: 'Referral created successfully.', referralId: id, hmisId: hmisId });
}

// ── handleEdit ───────────────────────────────────────────────
function handleEdit(data) {
  var ss             = SpreadsheetApp.getActiveSpreadsheet();
  var referralsSheet = ss.getSheetByName('Referrals');

  if (!referralsSheet) {
    return createJsonOutput({ success: false, message: 'Referrals sheet not found.' });
  }

  var values   = referralsSheet.getDataRange().getValues();
  var rowIndex = -1;
  var currentRow = null;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.id)) {
      rowIndex   = i + 1;
      currentRow = values[i];
      break;
    }
  }

  if (rowIndex === -1) {
    return createJsonOutput({ success: false, message: 'Referral not found.' });
  }

  var now = new Date();

  var updatedRow = [
    currentRow[0],                               // [0]  ID (unchanged)
    currentRow[1],                               // [1]  Original Timestamp (unchanged)
    currentRow[2],                               // [2]  HMIS ID (unchanged)
    data.clientName      || currentRow[3],       // [3]  Client Name
    data.clientDOB       || currentRow[4],       // [4]  DOB
    currentRow[5],                               // [5]  Is Existing Client (unchanged)
    data.fromProgram     || currentRow[6],       // [6]  From Program
    data.toProgram       || currentRow[7],       // [7]  To Program
    data.howFound        || currentRow[8],       // [8]  How Found
    data.serviceCategory || currentRow[9],       // [9]  Service Category
    data.urgency         || currentRow[10],      // [10] Urgency
    currentRow[11],                              // [11] Submitted By (unchanged)
    currentRow[12],                              // [12] Staff Email (unchanged)
    data.assessmentNotes || currentRow[13],      // [13] Assessment Notes
    data.status          || currentRow[14],      // [14] Status
    now                                          // [15] Last Updated
  ];

  referralsSheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);

  // Log referral update
  logReferralUpdate(currentRow[0], currentRow[2], updatedRow[3], 'Updated',
    currentRow[14], updatedRow[14], currentRow[11], currentRow[12]);

  return createJsonOutput({ success: true, message: 'Referral updated successfully.' });
}

// ── handleNewMessage ──────────────────────────────────────────
function handleNewMessage(data) {
  var ss            = SpreadsheetApp.getActiveSpreadsheet();
  var messagesSheet = ss.getSheetByName('Messages');

  if (!messagesSheet) {
    return createJsonOutput({ success: false, message: 'Messages sheet not found.' });
  }

  var messageId  = 'MSG_' + new Date().getTime();
  var threadId   = data.threadId   || ('THREAD_' + new Date().getTime());
  var threadType = data.threadType || 'direct';
  var now        = new Date();

  messagesSheet.appendRow([
    messageId,
    threadId,
    threadType,
    now,
    data.from    || '',
    data.to      || '',
    data.message || '',
    'false'
  ]);

  // Log activity
  logActivity(data.from, '', 'Sent Message', 'Message', messageId, 'To: ' + (data.to || ''));

  // data.to is already an email address
  var recipient = data.to || '';
  if (recipient && recipient.indexOf('@') !== -1) {
    sendMessageNotificationEmail(recipient, {
      from:    data.from    || '',
      to:      data.to      || '',
      message: data.message || ''
    });
  }

  return createJsonOutput({ success: true, message: 'Message sent.', messageId: messageId, threadId: threadId });
}

// ── handleUpdateUserRole ──────────────────────────────────────
function handleUpdateUserRole(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return createJsonOutput({ success: false, message: 'Users sheet not found.' });

  var email   = String(data.email || '').toLowerCase();
  var newRole = data.role || '';
  var values  = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) {
      sheet.getRange(i + 1, 3).setValue(newRole); // Column C = Role
      if (data.program !== undefined) {
        sheet.getRange(i + 1, 5).setValue(data.program); // Column E = Program
      }
      logActivity(data.changedBy || '', '', 'Updated Role', 'User', email, 'New role: ' + newRole);
      return createJsonOutput({ success: true });
    }
  }
  return createJsonOutput({ success: false, message: 'User not found.' });
}

// ── handleNewUser ─────────────────────────────────────────────
function handleNewUser(data) {
  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return createJsonOutput({ success: false, message: 'Users sheet not found.' });
  }

  var email   = data.email   || '';
  var name    = data.name    || '';
  var role    = data.role    || 'case_manager';
  var addedBy = data.addedBy || 'Admin';
  var now     = new Date();

  if (!email) {
    return createJsonOutput({ success: false, message: 'Email is required.' });
  }

  var existing = getUserRecord(email);
  if (existing) {
    return createJsonOutput({ success: false, message: 'User already exists.' });
  }

  usersSheet.appendRow([
    email,
    name,
    role,
    'Active',
    data.program || '',   // Program
    now,                  // Date Added
    '',                   // Last Login
    addedBy               // Added By
  ]);

  logActivity(addedBy, '', 'Added User', 'User', email, 'Role: ' + role);

  try {
    sendWelcomeEmail(email, { name: name, role: role, addedBy: addedBy });
  } catch (e) {
    Logger.log('Failed to send welcome email: ' + e.toString());
  }

  Logger.log('New user added: ' + email + ' (' + role + ')');
  return createJsonOutput({ success: true, message: 'User added successfully.', email: email });
}

// ── handleAddGoal ─────────────────────────────────────────────
function handleAddGoal(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Goals');
  if (!sheet) return createJsonOutput({ success: false, message: 'Goals sheet not found.' });

  var goalId = 'GOAL_' + new Date().getTime();
  var now    = new Date();

  sheet.appendRow([
    goalId,
    data.hmisId          || '',
    data.clientName      || '',
    data.goalDescription || '',
    data.targetDate      || '',
    data.status          || 'In Progress',
    data.priority        || 'Medium',
    data.createdBy       || '',
    data.staffEmail      || '',
    now,
    now
  ]);

  logActivity(data.staffEmail, data.createdBy, 'Added Goal', 'Goal', goalId,
    'Client: ' + (data.clientName || '') + ' | ' + (data.goalDescription || ''));

  return createJsonOutput({ success: true, goalId: goalId });
}

// ── handleUpdateGoal ──────────────────────────────────────────
function handleUpdateGoal(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Goals');
  if (!sheet) return createJsonOutput({ success: false, message: 'Goals sheet not found.' });

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.goalId)) {
      if (data.status)          sheet.getRange(i + 1, 6).setValue(data.status);
      if (data.goalDescription) sheet.getRange(i + 1, 4).setValue(data.goalDescription);
      if (data.targetDate)      sheet.getRange(i + 1, 5).setValue(data.targetDate);
      if (data.priority)        sheet.getRange(i + 1, 7).setValue(data.priority);
      sheet.getRange(i + 1, 11).setValue(new Date()); // Last Updated
      logActivity(data.staffEmail, '', 'Updated Goal', 'Goal', data.goalId, 'Status: ' + (data.status || ''));
      return createJsonOutput({ success: true });
    }
  }
  return createJsonOutput({ success: false, message: 'Goal not found.' });
}

// ── handleAddCaseNote ─────────────────────────────────────────
function handleAddCaseNote(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Case Notes');
  if (!sheet) return createJsonOutput({ success: false, message: 'Case Notes sheet not found.' });

  var noteId = 'NOTE_' + new Date().getTime();
  var now    = new Date();

  sheet.appendRow([
    noteId,
    data.hmisId      || '',
    data.clientName  || '',
    data.note        || '',
    data.noteType    || 'General',
    data.createdBy   || '',
    data.staffEmail  || '',
    now
  ]);

  logActivity(data.staffEmail, data.createdBy, 'Added Case Note', 'Case Note', noteId,
    'Client: ' + (data.clientName || '') + ' | Type: ' + (data.noteType || 'General'));

  return createJsonOutput({ success: true, noteId: noteId });
}

// ── handleAddProgram ──────────────────────────────────────────
function handleAddProgram(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programs');
  if (!sheet) return createJsonOutput({ success: false, message: 'Programs sheet not found.' });

  var programId = 'PROG_' + new Date().getTime();

  sheet.appendRow([
    programId,
    data.programName   || '',
    data.category      || '',
    data.description   || '',
    data.address       || '',
    data.phone         || '',
    data.contactName   || '',
    data.status        || 'Active',
    new Date()
  ]);

  logActivity(data.addedBy || '', '', 'Added Program', 'Program', programId, data.programName || '');

  return createJsonOutput({ success: true, programId: programId });
}

// ── handleAddOutcome ──────────────────────────────────────────
function handleAddOutcome(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Outcomes');
  if (!sheet) return createJsonOutput({ success: false, message: 'Outcomes sheet not found.' });

  var outcomeId = 'OUT_' + new Date().getTime();

  sheet.appendRow([
    outcomeId,
    data.referralId   || '',
    data.hmisId       || '',
    data.clientName   || '',
    data.outcome      || '',
    data.housingType  || '',
    data.dateAchieved || '',
    data.notes        || '',
    data.recordedBy   || '',
    data.staffEmail   || ''
  ]);

  logActivity(data.staffEmail, data.recordedBy, 'Recorded Outcome', 'Outcome', outcomeId,
    'Client: ' + (data.clientName || '') + ' | Outcome: ' + (data.outcome || ''));

  // Update referral status to 'completed' and log referral update
  if (data.referralId) {
    var refSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Referrals');
    if (refSheet) {
      var vals = refSheet.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]) === String(data.referralId)) {
          var prevStatus = vals[i][14] || '';
          refSheet.getRange(i + 1, 15).setValue('completed'); // col 15 = Status
          refSheet.getRange(i + 1, 16).setValue(new Date());  // col 16 = Last Updated
          logReferralUpdate(data.referralId, vals[i][2], vals[i][3], 'Outcome Recorded',
            prevStatus, 'completed', data.recordedBy, data.staffEmail);
          break;
        }
      }
    }
  }

  return createJsonOutput({ success: true, outcomeId: outcomeId });
}

// ── handleDeleteReferral (admin only — enforced on frontend) ──
function handleDeleteReferral(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Referrals');
  if (!sheet) return createJsonOutput({ success: false, message: 'Referrals sheet not found.' });
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.id)) {
      logReferralUpdate(data.id, values[i][2], values[i][3], 'Deleted',
        values[i][14], '', data.deletedBy || '', data.staffEmail || '');
      sheet.deleteRow(i + 1);
      return createJsonOutput({ success: true });
    }
  }
  return createJsonOutput({ success: false, message: 'Referral not found.' });
}

// ── handleUpdateProgram (admin only — enforced on frontend) ───
function handleUpdateProgram(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programs');
  if (!sheet) return createJsonOutput({ success: false, message: 'Programs sheet not found.' });
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.programId)) {
      var row = [
        values[i][0],
        data.programName  || values[i][1],
        data.category     || values[i][2],
        data.description  !== undefined ? data.description  : values[i][3],
        data.address      !== undefined ? data.address      : values[i][4],
        data.phone        !== undefined ? data.phone        : values[i][5],
        data.contactName  !== undefined ? data.contactName  : values[i][6],
        data.status       || values[i][7],
        values[i][8]
      ];
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      logActivity(data.updatedBy || '', '', 'Updated Program', 'Program', data.programId, data.programName || '');
      return createJsonOutput({ success: true });
    }
  }
  return createJsonOutput({ success: false, message: 'Program not found.' });
}

// ── handleDeleteProgram (admin only — enforced on frontend) ───
function handleDeleteProgram(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programs');
  if (!sheet) return createJsonOutput({ success: false, message: 'Programs sheet not found.' });
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.programId)) {
      sheet.deleteRow(i + 1);
      logActivity(data.deletedBy || '', '', 'Deleted Program', 'Program', data.programId, '');
      return createJsonOutput({ success: true });
    }
  }
  return createJsonOutput({ success: false, message: 'Program not found.' });
}

// ── handleUpdateUserProgram ───────────────────────────────────
function handleUpdateUserProgram(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return createJsonOutput({ success: false, message: 'Users sheet not found.' });
  var email   = String(data.email   || '').toLowerCase();
  var program = data.program || '';
  var values  = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) {
      sheet.getRange(i + 1, 5).setValue(program); // Column E = Program
      logActivity(data.changedBy || '', '', 'Updated Program Assignment', 'User', email, 'Program: ' + program);
      return createJsonOutput({ success: true });
    }
  }
  return createJsonOutput({ success: false, message: 'User not found.' });
}

// ── handleDeleteThread ────────────────────────────────────────
function handleDeleteThread(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Messages');
  if (!sheet) return createJsonOutput({ success: false, message: 'Messages sheet not found.' });
  var threadId = data.threadId || '';
  if (!threadId) return createJsonOutput({ success: false, message: 'Thread ID required.' });
  var values = sheet.getDataRange().getValues();
  var deleted = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]) === String(threadId)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  logActivity(data.deletedBy || '', '', 'Deleted Thread', 'Message', threadId, deleted + ' messages removed');
  return createJsonOutput({ success: true, deleted: deleted });
}

// ── handleUpdateClient ────────────────────────────────────────
function handleUpdateClient(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clients');
  if (!sheet) return createJsonOutput({ success: false, message: 'Clients sheet not found.' });
  var hmisId = data.hmisId || '';
  if (!hmisId) return createJsonOutput({ success: false, message: 'HMIS ID required.' });
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(hmisId)) {
      var row = i + 1;
      if (data.name)   sheet.getRange(row, 2).setValue(data.name);
      if (data.dob)    sheet.getRange(row, 3).setValue(data.dob);
      if (data.status) sheet.getRange(row, 5).setValue(data.status);
      sheet.getRange(row, 8).setValue(new Date()); // Last Activity
      logActivity(data.staffEmail || '', data.updatedBy || '', 'Updated Client', 'Client', hmisId, data.name || hmisId);
      return createJsonOutput({ success: true });
    }
  }
  // Client not found — append new row
  sheet.appendRow([hmisId, data.name || '', data.dob || '', new Date(), data.status || 'Active', data.updatedBy || '', 0, new Date()]);
  return createJsonOutput({ success: true, created: true });
}

// ── Users Sheet Helpers ───────────────────────────────────────
// Users cols (0-based):
// [0]Email [1]Name [2]Role [3]Status [4]Program [5]Date Added [6]Last Login [7]Added By
function getUserRecord(email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === String(email).toLowerCase()) {
      return {
        email:     values[i][0] || '',
        name:      values[i][1] || '',
        role:      values[i][2] || 'case_manager',
        status:    values[i][3] || 'Active',
        program:   values[i][4] || '',
        dateAdded: values[i][5] || '',
        lastLogin: values[i][6] || '',
        addedBy:   values[i][7] || ''
      };
    }
  }
  return null;
}

function updateLastLogin(email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === String(email).toLowerCase()) {
      sheet.getRange(i + 1, 7).setValue(new Date()); // Column G = Last Login
      return;
    }
  }
}

function getUsersFromSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    return {
      email:     row[0] || '',
      name:      row[1] || '',
      role:      row[2] || '',
      status:    row[3] || '',
      program:   row[4] || '',
      dateAdded: row[5] instanceof Date ? row[5].toISOString().slice(0,10) : row[5] || '',
      lastLogin: row[6] instanceof Date ? row[6].toISOString() : row[6] || '',
      addedBy:   row[7] || ''
    };
  });
}

// ── Sheet Readers ─────────────────────────────────────────────
// Referrals cols: [0]ID [1]Timestamp [2]HMIS ID [3]Name [4]DOB [5]Existing
//   [6]From [7]To [8]HowFound [9]Category [10]Urgency
//   [11]Submitted By [12]Staff Email [13]Notes [14]Status [15]Last Updated
function getReferralsFromSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Referrals');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    return {
      id:              row[0],
      timestamp:       row[1] instanceof Date ? row[1].toISOString() : row[1],
      hmisId:          row[2]  || '',
      clientName:      row[3]  || '',
      clientDOB:       row[4] instanceof Date ? row[4].toISOString().slice(0,10) : row[4] || '',
      isExistingClient:row[5]  || '',
      fromProgram:     row[6]  || '',
      toProgram:       row[7]  || '',
      howFound:        row[8]  || '',
      serviceCategory: row[9]  || '',
      urgency:         row[10] || '',
      submittedBy:     row[11] || '',
      staffEmail:      row[12] || '',
      assessmentNotes: row[13] || '',
      status:          row[14] || '',
      lastUpdated:     row[15] instanceof Date ? row[15].toISOString() : row[15] || ''
    };
  });
}

function getClientsFromSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clients');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    return {
      hmisId:        row[0] || '',
      name:          row[1] || '',
      dob:           row[2] instanceof Date ? row[2].toISOString().slice(0,10) : row[2] || '',
      dateAdded:     row[3] instanceof Date ? row[3].toISOString().slice(0,10) : row[3] || '',
      status:        row[4] || '',
      caseManager:   row[5] || '',
      totalReferrals:row[6] || 0,
      lastActivity:  row[7] instanceof Date ? row[7].toISOString().slice(0,10) : row[7] || ''
    };
  });
}

function getMessagesFromSheet(threadId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Messages');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).filter(function(row) {
    return row[0] && (!threadId || String(row[1]) === String(threadId));
  }).map(function(row) {
    return {
      messageId:  row[0] || '',
      threadId:   row[1] || '',
      threadType: row[2] || '',
      timestamp:  row[3] instanceof Date ? row[3].toISOString() : row[3] || '',
      from:       row[4] || '',
      to:         row[5] || '',
      message:    row[6] || '',
      isRead:     row[7] || 'false'
    };
  });
}

function getThreadsFromSheet(user) {
  var messages = getMessagesFromSheet('');
  var threadMap = {};

  messages.forEach(function(msg) {
    if (user && msg.from !== user && msg.to !== user) return;

    var tid = msg.threadId;
    if (!threadMap[tid] || new Date(msg.timestamp) > new Date(threadMap[tid].lastTimestamp)) {
      threadMap[tid] = {
        threadId:      tid,
        threadType:    msg.threadType,
        lastTimestamp: msg.timestamp,
        lastMessage:   msg.message,
        from:          msg.from,
        to:            msg.to,
        unreadCount:   0
      };
    }
    if (msg.to === user && msg.isRead === 'false') {
      threadMap[tid].unreadCount = (threadMap[tid].unreadCount || 0) + 1;
    }
  });

  return Object.values(threadMap).sort(function(a, b) {
    return new Date(b.lastTimestamp) - new Date(a.lastTimestamp);
  });
}

function getGoalsFromSheet(hmisId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Goals');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).filter(function(row) {
    return row[0] && (!hmisId || String(row[1]) === String(hmisId));
  }).map(function(row) {
    return {
      goalId:          row[0] || '',
      hmisId:          row[1] || '',
      clientName:      row[2] || '',
      goalDescription: row[3] || '',
      targetDate:      row[4] instanceof Date ? row[4].toISOString().slice(0,10) : row[4] || '',
      status:          row[5] || '',
      priority:        row[6] || '',
      createdBy:       row[7] || '',
      staffEmail:      row[8] || '',
      dateCreated:     row[9]  instanceof Date ? row[9].toISOString()  : row[9]  || '',
      lastUpdated:     row[10] instanceof Date ? row[10].toISOString() : row[10] || ''
    };
  });
}

function getCaseNotesFromSheet(hmisId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Case Notes');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).filter(function(row) {
    return row[0] && (!hmisId || String(row[1]) === String(hmisId));
  }).map(function(row) {
    return {
      noteId:      row[0] || '',
      hmisId:      row[1] || '',
      clientName:  row[2] || '',
      note:        row[3] || '',
      noteType:    row[4] || '',
      createdBy:   row[5] || '',
      staffEmail:  row[6] || '',
      dateCreated: row[7] instanceof Date ? row[7].toISOString() : row[7] || ''
    };
  });
}

function getProgramsFromSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programs');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    return {
      programId:   row[0] || '',
      programName: row[1] || '',
      category:    row[2] || '',
      description: row[3] || '',
      address:     row[4] || '',
      phone:       row[5] || '',
      contactName: row[6] || '',
      status:      row[7] || '',
      dateAdded:   row[8] instanceof Date ? row[8].toISOString().slice(0,10) : row[8] || ''
    };
  });
}

function getOutcomesFromSheet(referralId, hmisId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Outcomes');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).filter(function(row) {
    if (!row[0]) return false;
    if (referralId && String(row[1]) !== String(referralId)) return false;
    if (hmisId    && String(row[2]) !== String(hmisId))    return false;
    return true;
  }).map(function(row) {
    return {
      outcomeId:    row[0] || '',
      referralId:   row[1] || '',
      hmisId:       row[2] || '',
      clientName:   row[3] || '',
      outcome:      row[4] || '',
      housingType:  row[5] || '',
      dateAchieved: row[6] instanceof Date ? row[6].toISOString().slice(0,10) : row[6] || '',
      notes:        row[7] || '',
      recordedBy:   row[8] || '',
      staffEmail:   row[9] || ''
    };
  });
}

function getActivityLogFromSheet(limitRows) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Activity Log');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var limit = parseInt(limitRows) || 100;
  var rows  = values.slice(1).filter(function(r) { return r[0]; });

  // Return most recent first
  rows.reverse();
  if (rows.length > limit) rows = rows.slice(0, limit);

  return rows.map(function(row) {
    return {
      logId:      row[0] || '',
      timestamp:  row[1] instanceof Date ? row[1].toISOString() : row[1] || '',
      userEmail:  row[2] || '',
      userName:   row[3] || '',
      action:     row[4] || '',
      targetType: row[5] || '',
      targetId:   row[6] || '',
      details:    row[7] || ''
    };
  });
}

function getReferralUpdatesFromSheet(referralId, limitRows) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Referral Updates');
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var limit = parseInt(limitRows) || 200;
  var rows  = values.slice(1).filter(function(r) {
    return r[0] && (!referralId || String(r[2]) === String(referralId));
  });

  rows.reverse();
  if (rows.length > limit) rows = rows.slice(0, limit);

  return rows.map(function(row) {
    return {
      updateId:   row[0] || '',
      timestamp:  row[1] instanceof Date ? row[1].toISOString() : row[1] || '',
      referralId: row[2] || '',
      hmisId:     row[3] || '',
      clientName: row[4] || '',
      action:     row[5] || '',
      oldStatus:  row[6] || '',
      newStatus:  row[7] || '',
      changedBy:  row[8] || '',
      staffEmail: row[9] || ''
    };
  });
}

// ── Client Upsert ─────────────────────────────────────────────
function upsertClient(sheet, clientData) {
  if (!sheet) return;

  var values   = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(clientData.hmisId)) {
      rowIndex = i + 1;
      break;
    }
  }

  var totalReferrals = rowIndex > 0 ? (parseInt(values[rowIndex - 1][6]) || 0) + 1 : 1;

  var row = [
    clientData.hmisId,
    clientData.name,
    clientData.dob,
    clientData.dateAdded,
    clientData.status       || 'Active',
    clientData.caseManager  || '',
    totalReferrals,
    clientData.lastActivity
  ];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

// ── Overdue Referral Check ───────────────────────────────────
// Referrals cols: [11]=Submitted By, [12]=Staff Email, [14]=Status
function checkOverdueReferrals() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Referrals');
  if (!sheet) return;

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  var now         = new Date();
  var threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  values.slice(1).forEach(function(row) {
    if (!row[0]) return;

    var status    = String(row[14]).toLowerCase();
    var timestamp = row[1] instanceof Date ? row[1] : new Date(row[1]);
    var ageMs     = now - timestamp;
    var ageDays   = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    if (status === 'pending' && ageMs > threeDaysMs) {
      var submittedBy = row[11]; // staff name
      var staffEmail  = row[12]; // staff email

      var info = {
        referralId:      row[0],
        hmisId:          row[2],
        clientName:      row[3],
        serviceCategory: row[9],
        urgency:         row[10],
        submittedBy:     submittedBy,
        ageDays:         ageDays,
        timestamp:       timestamp
      };

      // Email the submitting staff directly
      if (staffEmail && staffEmail.indexOf('@') !== -1) {
        sendOverdueEmail(staffEmail, info);
      }

      // Also notify supervisor
      sendOverdueEmail(SUPERVISOR_EMAIL, info);
    }
  });
}

// ── Trigger Setup ────────────────────────────────────────────
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkOverdueReferrals') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkOverdueReferrals')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  Logger.log('Daily trigger for checkOverdueReferrals created (runs at 8 AM daily).');
}

// ── Email Senders ─────────────────────────────────────────────
function sendNewReferralEmail(recipient, info) {
  try {
    var subject = 'New Referral Submitted: ' + info.clientName + ' \u2014 ' + toTitleCase(info.serviceCategory);
    var body = [
      'Hello,',
      '',
      'A new referral has been submitted in the HOPICS Referral System.',
      '',
      '--- REFERRAL DETAILS ---',
      'Referral ID:      ' + info.referralId,
      'HMIS ID:          ' + (info.hmisId || '(not provided)'),
      'Client Name:      ' + info.clientName,
      'Date of Birth:    ' + info.dob,
      '',
      'From Program:     ' + info.fromProgram,
      'To Program:       ' + info.toProgram,
      'How Client Found: ' + toTitleCase(info.howFound),
      '',
      'Service Category: ' + toTitleCase(info.serviceCategory),
      'Urgency Level:    ' + toTitleCase(info.urgency).toUpperCase(),
      'Submitted By:     ' + info.submittedBy + ' (' + info.staffEmail + ')',
      '',
      '--- ASSESSMENT NOTES ---',
      info.assessmentNotes || '(none)',
      '',
      'Thank you,',
      'HOPICS Referral System'
    ].join('\n');

    MailApp.sendEmail(recipient, subject, body);
    Logger.log('New referral email sent to ' + recipient);
  } catch (e) {
    Logger.log('Failed to send new referral email: ' + e.toString());
  }
}

function sendOverdueEmail(recipient, info) {
  try {
    var subject = '\u26a0\ufe0f Overdue Referral: ' + info.clientName + ' (' + info.ageDays + ' days pending)';
    var body = [
      'Hello,',
      '',
      'The following referral has been pending for ' + info.ageDays + ' day(s) and requires immediate attention.',
      '',
      '--- OVERDUE REFERRAL ---',
      'Referral ID:      ' + info.referralId,
      'HMIS ID:          ' + (info.hmisId || '(not provided)'),
      'Client Name:      ' + info.clientName,
      'Service Category: ' + toTitleCase(info.serviceCategory),
      'Urgency:          ' + toTitleCase(info.urgency),
      'Submitted By:     ' + info.submittedBy,
      'Created:          ' + (info.timestamp ? info.timestamp.toDateString() : ''),
      'Days Pending:     ' + info.ageDays,
      '',
      'Please log in to the HOPICS Referral App and update the status immediately.',
      '',
      'Thank you,',
      'HOPICS Referral System'
    ].join('\n');

    MailApp.sendEmail(recipient, subject, body);
    Logger.log('Overdue email sent to ' + recipient);
  } catch (e) {
    Logger.log('Failed to send overdue email: ' + e.toString());
  }
}

function sendMessageNotificationEmail(recipient, info) {
  try {
    var subject = '\ud83d\udcac New Message \u2014 HOPICS Referral System';
    var appUrl  = 'https://anissacd.github.io/HOPICS-Referral-App/messages.html';

    var html = [
      '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">',
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 0;">',
      '<tr><td align="center">',
      '<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">',
      '<tr><td style="background:#111111;padding:28px 36px;text-align:center;">',
      '<span style="font-size:1.4rem;font-weight:800;letter-spacing:0.15em;color:#ffd700;">HOPICS</span>',
      '<p style="color:#a0a0a8;font-size:0.8rem;margin:6px 0 0;">Referral Management System</p>',
      '</td></tr>',
      '<tr><td style="padding:36px;">',
      '<p style="font-size:1rem;font-weight:600;color:#1d1d1f;margin:0 0 8px;">You have a new message</p>',
      '<p style="font-size:0.875rem;color:#6e6e73;margin:0 0 24px;">Someone sent you a message on HOPICS.</p>',
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;border-radius:12px;padding:20px;margin-bottom:24px;">',
      '<tr><td>',
      '<p style="font-size:0.75rem;font-weight:600;color:#aeaeb2;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">From</p>',
      '<p style="font-size:0.9rem;color:#1d1d1f;margin:0 0 16px;">' + info.from + '</p>',
      '<p style="font-size:0.75rem;font-weight:600;color:#aeaeb2;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Message</p>',
      '<p style="font-size:1rem;color:#1d1d1f;line-height:1.6;margin:0;padding:12px 16px;background:#ffffff;border-radius:8px;border-left:3px solid #ffd700;">' + info.message + '</p>',
      '</td></tr></table>',
      '<table cellpadding="0" cellspacing="0" style="margin:0 auto;">',
      '<tr><td style="background:#ffd700;border-radius:10px;padding:12px 28px;text-align:center;">',
      '<a href="' + appUrl + '" style="color:#111111;font-weight:700;font-size:0.9rem;text-decoration:none;">Reply in HOPICS \u2192</a>',
      '</td></tr></table>',
      '</td></tr>',
      '<tr><td style="background:#f5f5f7;padding:20px 36px;text-align:center;border-top:1px solid #e5e5ea;">',
      '<p style="font-size:0.75rem;color:#aeaeb2;margin:0;">This is an internal notification from the HOPICS Referral System.<br>Do not share this email \u2014 it may contain protected information.</p>',
      '</td></tr>',
      '</table></td></tr></table></body></html>'
    ].join('');

    MailApp.sendEmail({ to: recipient, subject: subject, htmlBody: html });
  } catch (e) {
    Logger.log('Failed to send message notification email: ' + e.toString());
  }
}

function sendWelcomeEmail(recipient, info) {
  try {
    var roleLabel = toTitleCase(String(info.role).replace(/_/g, ' '));
    var subject   = 'Welcome to HOPICS Referral System';
    var body = [
      'Hello ' + (info.name || '') + ',',
      '',
      'You have been granted access to the HOPICS Referral Management System.',
      '',
      'Role:      ' + roleLabel,
      'Added by:  ' + (info.addedBy || 'Administrator'),
      '',
      'To sign in, visit the HOPICS Referral App and click "Sign in with Google" using this email address.',
      '',
      'IMPORTANT: This system contains protected health information (PHI).',
      'Access must be limited to authorized, need-to-know purposes only.',
      'Unauthorized disclosure is a violation of HIPAA.',
      '',
      'If you have any questions, contact your system administrator.',
      '',
      'Thank you,',
      'HOPICS Referral System'
    ].join('\n');

    MailApp.sendEmail(recipient, subject, body);
    Logger.log('Welcome email sent to ' + recipient);
  } catch (e) {
    Logger.log('Failed to send welcome email: ' + e.toString());
  }
}

// ── Utility ───────────────────────────────────────────────────
function toTitleCase(str) {
  if (!str) return '';
  return String(str).replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}
