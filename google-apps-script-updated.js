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
// Referrals: ID | Timestamp | HMIS ID | Client Name | DOB | Is Existing Client |
//            From Program | To Program | How Found | Service Category | Urgency |
//            Assigned To | Assessment Notes | Status | Last Updated | Created By
var REFERRAL_HEADERS = [
  'ID', 'Timestamp', 'HMIS ID', 'Client Name', 'DOB', 'Is Existing Client',
  'From Program', 'To Program', 'How Found', 'Service Category', 'Urgency',
  'Assigned To', 'Assessment Notes', 'Status', 'Last Updated', 'Created By'
];

// Clients: HMIS ID | Name | DOB | Date Added | Status | Case Manager |
//          Total Referrals | Last Activity
var CLIENT_HEADERS = [
  'HMIS ID', 'Name', 'DOB', 'Date Added', 'Status',
  'Case Manager', 'Total Referrals', 'Last Activity'
];

// Messages: Message ID | Thread ID | Thread Type | Timestamp |
//           From | To | Message | Is Read
var MESSAGE_HEADERS = [
  'Message ID', 'Thread ID', 'Thread Type', 'Timestamp',
  'From', 'To', 'Message', 'Is Read'
];

// Users: Email | Name | Role | Status | Date Added | Last Login | Added By
var USER_HEADERS = [
  'Email', 'Name', 'Role', 'Status', 'Date Added', 'Last Login', 'Added By'
];

// ── Sheet Initialisation ─────────────────────────────────────
function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheetsConfig = [
    { name: 'Referrals', headers: REFERRAL_HEADERS },
    { name: 'Clients',   headers: CLIENT_HEADERS   },
    { name: 'Messages',  headers: MESSAGE_HEADERS  },
    { name: 'Users',     headers: USER_HEADERS     }
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

// ── doPost ───────────────────────────────────────────────────
function doPost(e) {
  try {
    Logger.log('doPost called: ' + JSON.stringify(e.parameter));
    initializeSheets();

    var data = e.parameter;

    if (data.action === 'newMessage') {
      return handleNewMessage(data);
    }

    if (data.action === 'newUser') {
      return handleNewUser(data);
    }

    if (data.action === 'updateUserRole') {
      return handleUpdateUserRole(data);
    }

    if (data.id) {
      return handleEdit(data);
    }

    return handleNewReferral(data);
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return createJsonOutput({ success: false, message: error.toString() });
  }
}

// ── doGet ────────────────────────────────────────────────────
function doGet(e) {
  initializeSheets();

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
      // Update last login timestamp
      updateLastLogin(email);
      return createJsonOutput({
        authorized: true,
        role: result.role || 'case_manager',
        name: result.name || ''
      }, callback);
    }

    return createJsonOutput({ authorized: false }, callback);
  }

  // ── List all users (admin) ────────────────────────────────
  if (action === 'listUsers') {
    var usersData = getUsersFromSheet();
    return createJsonOutput({ success: true, users: usersData }, callback);
  }

  if (action === 'listReferrals') {
    var referrals = getReferralsFromSheet();
    if (params.staffEmail) {
      var filterEmail = params.staffEmail.toLowerCase();
      referrals = referrals.filter(function(r) {
        return String(r.staffEmail || '').toLowerCase() === filterEmail;
      });
    } else if (params.assignedTo) {
      referrals = referrals.filter(function(r) {
        return r.assignedTo === params.assignedTo;
      });
    }
    return createJsonOutput({ success: true, referrals: referrals }, callback);
  }

  if (action === 'listClients') {
    var clients = getClientsFromSheet();
    return createJsonOutput({ success: true, clients: clients }, callback);
  }

  if (action === 'getMessages') {
    var messages = getMessagesFromSheet(params.thread || '');
    return createJsonOutput({ success: true, messages: messages }, callback);
  }

  if (action === 'getThreads') {
    var threads = getThreadsFromSheet(params.user || '');
    return createJsonOutput({ success: true, threads: threads }, callback);
  }

  return createJsonOutput({ success: true, message: 'HOPICS Google Apps Script is running.' }, callback);
}

// ── handleNewReferral ─────────────────────────────────────────
function handleNewReferral(data) {
  var ss             = SpreadsheetApp.getActiveSpreadsheet();
  var referralsSheet = ss.getSheetByName('Referrals');
  var clientsSheet   = ss.getSheetByName('Clients');

  var id        = 'REF_' + new Date().getTime();
  var now       = new Date();

  // Use staffEmail from form data (web app cannot use Session.getActiveUser())
  var createdBy = data.staffEmail || 'Web App User';

  // Use HMIS ID provided by staff (from LAHSA HMIS system)
  var hmisId = data.hmisId || '';
  var isNew  = !data.isExistingClient || data.isExistingClient === 'false';

  // Append to Referrals sheet
  referralsSheet.appendRow([
    id,                          // ID
    now,                         // Timestamp
    hmisId,                      // HMIS ID (entered manually by staff)
    data.clientName        || '',// Client Name
    data.clientDOB         || '',// DOB
    isNew ? 'No' : 'Yes',        // Is Existing Client
    data.fromProgram       || '',// From Program
    data.toProgram         || '',// To Program
    data.referralSource    || '',// How Found
    data.serviceCategory   || '',// Service Category
    data.urgency           || '',// Urgency
    data.submittedBy || data.assignedTo || '',// Submitted By
    data.assessmentNotes   || '',// Assessment Notes
    'pending',                   // Status
    now,                         // Last Updated
    createdBy                    // Created By
  ]);

  // Create or update Clients sheet
  upsertClient(clientsSheet, {
    hmisId:      hmisId,
    name:        data.clientName     || '',
    dob:         data.clientDOB      || '',
    dateAdded:   now,
    status:      'Active',
    caseManager: data.assignedTo     || '',
    lastActivity: now
  });

  // Email assigned staff — look up email from Users sheet
  var recipient = getStaffEmailByName(data.assignedTo);
  if (recipient) {
    sendNewReferralEmail(recipient, {
      referralId:      id,
      hmisId:          hmisId,
      clientName:      data.clientName      || '',
      dob:             data.clientDOB       || '',
      fromProgram:     data.fromProgram     || '',
      toProgram:       data.toProgram       || '',
      howFound:        data.referralSource  || '',
      serviceCategory: data.serviceCategory || '',
      urgency:         data.urgency         || '',
      assignedTo:      data.assignedTo      || '',
      assessmentNotes: data.assessmentNotes || '',
      createdBy:       createdBy
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

  var now              = new Date();
  var previousAssigned = currentRow[11]; // Assigned To column (0-indexed col 11)

  var updatedRow = [
    currentRow[0],                              // ID (unchanged)
    currentRow[1],                              // Original Timestamp (unchanged)
    currentRow[2],                              // HMIS ID (unchanged)
    data.clientName        || currentRow[3],    // Client Name
    data.clientDOB         || currentRow[4],    // DOB
    currentRow[5],                              // Is Existing Client (unchanged)
    data.fromProgram       || currentRow[6],    // From Program
    data.toProgram         || currentRow[7],    // To Program
    data.howFound          || currentRow[8],    // How Found
    data.serviceCategory   || currentRow[9],    // Service Category
    data.urgency           || currentRow[10],   // Urgency
    data.assignedTo        || currentRow[11],   // Assigned To
    data.assessmentNotes   || currentRow[12],   // Assessment Notes
    data.status            || currentRow[13],   // Status
    now,                                        // Last Updated
    currentRow[15]                              // Created By (unchanged)
  ];

  referralsSheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);

  // Email new assignee if reassigned
  var newAssigned = updatedRow[11];
  if (data.assignedTo && data.assignedTo !== previousAssigned) {
    var recipient = getStaffEmailByName(newAssigned);
    if (recipient) {
      sendReassignmentEmail(recipient, {
        referralId:      currentRow[0],
        hmisId:          currentRow[2],
        clientName:      updatedRow[3],
        serviceCategory: updatedRow[9],
        urgency:         updatedRow[10],
        previousAssigned: previousAssigned,
        newAssigned:      newAssigned,
        assessmentNotes:  updatedRow[12]
      });
    }
  }

  return createJsonOutput({ success: true, message: 'Referral updated successfully.' });
}

// ── handleNewMessage ──────────────────────────────────────────
function handleNewMessage(data) {
  var ss           = SpreadsheetApp.getActiveSpreadsheet();
  var messagesSheet = ss.getSheetByName('Messages');

  if (!messagesSheet) {
    return createJsonOutput({ success: false, message: 'Messages sheet not found.' });
  }

  var messageId  = 'MSG_' + new Date().getTime();
  var threadId   = data.threadId   || ('THREAD_' + new Date().getTime());
  var threadType = data.threadType || 'direct';
  var now        = new Date();

  messagesSheet.appendRow([
    messageId,         // Message ID
    threadId,          // Thread ID
    threadType,        // Thread Type
    now,               // Timestamp
    data.from || '',   // From
    data.to   || '',   // To
    data.message || '',// Message
    'false'            // Is Read
  ]);

  // data.to is already an email address — send notification directly
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

// ── handleNewUser ─────────────────────────────────────────────
function handleUpdateUserRole(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return createJsonOutput({ success: false, message: 'Users sheet not found.' });

  var email   = String(data.email || '').toLowerCase();
  var newRole = data.role || '';
  var values  = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) {
      sheet.getRange(i + 1, 3).setValue(newRole); // Column C = Role
      return createJsonOutput({ success: true });
    }
  }
  return createJsonOutput({ success: false, message: 'User not found.' });
}

function handleNewUser(data) {
  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return createJsonOutput({ success: false, message: 'Users sheet not found.' });
  }

  var email    = data.email    || '';
  var name     = data.name     || '';
  var role     = data.role     || 'case_manager';
  var addedBy  = data.addedBy  || 'Admin';
  var now      = new Date();

  if (!email) {
    return createJsonOutput({ success: false, message: 'Email is required.' });
  }

  // Check if user already exists
  var existing = getUserRecord(email);
  if (existing) {
    return createJsonOutput({ success: false, message: 'User already exists.' });
  }

  usersSheet.appendRow([
    email,   // Email
    name,    // Name
    role,    // Role
    'Active',// Status
    now,     // Date Added
    '',      // Last Login (empty until they sign in)
    addedBy  // Added By
  ]);

  // Send welcome email to new user
  try {
    sendWelcomeEmail(email, { name: name, role: role, addedBy: addedBy });
  } catch (e) {
    Logger.log('Failed to send welcome email: ' + e.toString());
  }

  Logger.log('New user added: ' + email + ' (' + role + ')');
  return createJsonOutput({ success: true, message: 'User added successfully.', email: email });
}

// ── Users Sheet Helpers ───────────────────────────────────────
function getUserRecord(email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return null;

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === String(email).toLowerCase()) {
      return {
        email:    values[i][0] || '',
        name:     values[i][1] || '',
        role:     values[i][2] || 'case_manager',
        status:   values[i][3] || 'Active',
        dateAdded: values[i][4] || '',
        lastLogin: values[i][5] || '',
        addedBy:   values[i][6] || ''
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
      sheet.getRange(i + 1, 6).setValue(new Date()); // Column F = Last Login
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
      email:    row[0] || '',
      name:     row[1] || '',
      role:     row[2] || '',
      status:   row[3] || '',
      dateAdded: row[4] instanceof Date ? row[4].toISOString().slice(0,10) : row[4] || '',
      lastLogin: row[5] instanceof Date ? row[5].toISOString() : row[5] || '',
      addedBy:   row[6] || ''
    };
  });
}

// ── Look up staff email by display name in Users sheet ────────
function getStaffEmailByName(displayName) {
  if (!displayName) return null;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return null;

  var values = sheet.getDataRange().getValues();
  var lowerName = displayName.toLowerCase().trim();

  for (var i = 1; i < values.length; i++) {
    var rowName = String(values[i][1]).toLowerCase().trim();
    // Try exact match first, then prefix match (e.g. "Ashley R." matches "Ashley Rivera")
    if (rowName === lowerName || rowName.startsWith(lowerName.replace('.', '').trim())) {
      return values[i][0] || null; // Column A = Email
    }
  }

  return null;
}

// ── Sheet Readers ─────────────────────────────────────────────
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
      assignedTo:      row[11] || '',
      assessmentNotes: row[12] || '',
      status:          row[13] || '',
      lastUpdated:     row[14] instanceof Date ? row[14].toISOString() : row[14] || '',
      staffEmail:      row[15] || '',
      createdBy:       row[15] || ''
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
    clientData.status      || 'Active',
    clientData.caseManager || '',
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
function checkOverdueReferrals() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Referrals');
  if (!sheet) return;

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  var now        = new Date();
  var threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  values.slice(1).forEach(function(row) {
    if (!row[0]) return;

    var status    = String(row[13]).toLowerCase();
    var timestamp = row[1] instanceof Date ? row[1] : new Date(row[1]);
    var ageMs     = now - timestamp;
    var ageDays   = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    if (status === 'pending' && ageMs > threeDaysMs) {
      var assignedTo = row[11];
      // Look up the assigned staff's email from Users sheet by matching name
      var recipient  = getStaffEmailByName(assignedTo);

      if (recipient) {
        sendOverdueEmail(recipient, {
          referralId:      row[0],
          hmisId:          row[2],
          clientName:      row[3],
          serviceCategory: row[9],
          urgency:         row[10],
          assignedTo:      assignedTo,
          ageDays:         ageDays,
          timestamp:       timestamp
        });
      }

      // Also notify supervisor
      sendOverdueEmail(SUPERVISOR_EMAIL, {
        referralId:      row[0],
        hmisId:          row[2],
        clientName:      row[3],
        serviceCategory: row[9],
        urgency:         row[10],
        assignedTo:      assignedTo,
        ageDays:         ageDays,
        timestamp:       timestamp
      });
    }
  });
}

// ── Trigger Setup ────────────────────────────────────────────
function setupDailyTrigger() {
  // Remove existing triggers for checkOverdueReferrals
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkOverdueReferrals') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 8 AM
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
    var subject = 'New Referral Assigned: ' + info.clientName + ' \u2014 ' + toTitleCase(info.serviceCategory);
    var body = [
      'Hello,',
      '',
      'A new referral has been assigned to you in the HOPICS Referral System. Please review and follow up within 3 business days.',
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
      'Assigned To:      ' + info.assignedTo,
      '',
      '--- ASSESSMENT NOTES ---',
      info.assessmentNotes || '(none)',
      '',
      '--- ACTION REQUIRED ---',
      'Please update the status of this referral within 3 business days.',
      'Log in to the HOPICS Referral App to view and manage this referral.',
      '',
      'This referral was created by: ' + info.createdBy,
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

function sendReassignmentEmail(recipient, info) {
  try {
    var subject = 'Referral Reassigned to You: ' + info.clientName + ' \u2014 ' + toTitleCase(info.serviceCategory);
    var body = [
      'Hello,',
      '',
      'A referral has been reassigned to you.',
      '',
      'Referral ID:       ' + info.referralId,
      'HMIS ID:           ' + (info.hmisId || '(not provided)'),
      'Client Name:       ' + info.clientName,
      'Service Category:  ' + toTitleCase(info.serviceCategory),
      'Urgency:           ' + toTitleCase(info.urgency),
      'Previously Assigned To: ' + info.previousAssigned,
      '',
      'Assessment Notes:',
      info.assessmentNotes || '(none)',
      '',
      'Please log in to the HOPICS Referral App to manage this referral.',
      '',
      'Thank you,',
      'HOPICS Referral System'
    ].join('\n');

    MailApp.sendEmail(recipient, subject, body);
    Logger.log('Reassignment email sent to ' + recipient);
  } catch (e) {
    Logger.log('Failed to send reassignment email: ' + e.toString());
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
      'Assigned To:      ' + info.assignedTo,
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
    var subject = '💬 New Message — HOPICS Referral System';
    var appUrl  = 'https://anissacd.github.io/HOPICS-Referral-App/messages.html';

    var html = [
      '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">',
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 0;">',
      '<tr><td align="center">',
      '<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">',

      // Header
      '<tr><td style="background:#111111;padding:28px 36px;text-align:center;">',
      '<span style="font-size:1.4rem;font-weight:800;letter-spacing:0.15em;color:#ffd700;">HOPICS</span>',
      '<p style="color:#a0a0a8;font-size:0.8rem;margin:6px 0 0;">Referral Management System</p>',
      '</td></tr>',

      // Body
      '<tr><td style="padding:36px;">',
      '<p style="font-size:1rem;font-weight:600;color:#1d1d1f;margin:0 0 8px;">You have a new message</p>',
      '<p style="font-size:0.875rem;color:#6e6e73;margin:0 0 24px;">Someone sent you a message on HOPICS.</p>',

      // Message card
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;border-radius:12px;padding:20px;margin-bottom:24px;">',
      '<tr><td>',
      '<p style="font-size:0.75rem;font-weight:600;color:#aeaeb2;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">From</p>',
      '<p style="font-size:0.9rem;color:#1d1d1f;margin:0 0 16px;">' + info.from + '</p>',
      '<p style="font-size:0.75rem;font-weight:600;color:#aeaeb2;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Message</p>',
      '<p style="font-size:1rem;color:#1d1d1f;line-height:1.6;margin:0;padding:12px 16px;background:#ffffff;border-radius:8px;border-left:3px solid #ffd700;">' + info.message + '</p>',
      '</td></tr></table>',

      // CTA button
      '<table cellpadding="0" cellspacing="0" style="margin:0 auto;">',
      '<tr><td style="background:#ffd700;border-radius:10px;padding:12px 28px;text-align:center;">',
      '<a href="' + appUrl + '" style="color:#111111;font-weight:700;font-size:0.9rem;text-decoration:none;">Reply in HOPICS →</a>',
      '</td></tr></table>',
      '</td></tr>',

      // Footer
      '<tr><td style="background:#f5f5f7;padding:20px 36px;text-align:center;border-top:1px solid #e5e5ea;">',
      '<p style="font-size:0.75rem;color:#aeaeb2;margin:0;">This is an internal notification from the HOPICS Referral System.<br>Do not share this email — it may contain protected information.</p>',
      '</td></tr>',

      '</table></td></tr></table></body></html>'
    ].join('');

    MailApp.sendEmail({
      to:       recipient,
      subject:  subject,
      htmlBody: html
    });
  } catch (e) {
    Logger.log('Failed to send message notification email: ' + e.toString());
  }
}

function sendWelcomeEmail(recipient, info) {
  try {
    var roleLabel = toTitleCase(String(info.role).replace(/_/g, ' '));
    var subject = 'Welcome to HOPICS Referral System';
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
