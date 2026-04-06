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

// ── Staff Email Map ──────────────────────────────────────────
var STAFF_EMAILS = {
  ashley: 'ashley.r@hopics.org',
  carlos: 'carlos.m@hopics.org',
  elena:  'elena.v@hopics.org',
  marcus: 'marcus.d@hopics.org'
};

var SUPERVISOR_EMAIL = 'supervisor@hopics.org';

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

// ── Sheet Initialisation ─────────────────────────────────────
function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheetsConfig = [
    { name: 'Referrals', headers: REFERRAL_HEADERS },
    { name: 'Clients',   headers: CLIENT_HEADERS   },
    { name: 'Messages',  headers: MESSAGE_HEADERS  }
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

// ── HMIS ID Generator ────────────────────────────────────────
function generateHmisId() {
  var year  = new Date().getFullYear();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clients');
  var count = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
  var seq   = String(count + 1).padStart(5, '0');
  return 'HTX-' + year + '-' + seq;
}

// ── Helpers ──────────────────────────────────────────────────
function getUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || 'Web App User';
  } catch (e) {
    return 'Web App User';
  }
}

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

function staffEmail(assignedTo) {
  return STAFF_EMAILS[assignedTo] || null;
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

  if (action === 'listReferrals') {
    var referrals = getReferralsFromSheet();
    if (params.assignedTo) {
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
  var createdBy = getUserEmail();

  // Resolve or generate HMIS ID
  var hmisId = data.hmisId || '';
  var isNew  = !data.isExistingClient || data.isExistingClient === 'false';

  if (isNew && !hmisId) {
    hmisId = generateHmisId();
  }

  // Append to Referrals sheet
  referralsSheet.appendRow([
    id,                          // ID
    now,                         // Timestamp
    hmisId,                      // HMIS ID
    data.clientName        || '',// Client Name
    data.clientDOB         || '',// DOB
    isNew ? 'No' : 'Yes',        // Is Existing Client
    data.fromProgram       || '',// From Program
    data.toProgram         || '',// To Program
    data.referralSource    || '',// How Found
    data.serviceCategory   || '',// Service Category
    data.urgency           || '',// Urgency
    data.assignedTo        || '',// Assigned To
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

  // Email assigned staff
  var recipient = staffEmail(data.assignedTo);
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
    var recipient = staffEmail(newAssigned);
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

  // Email recipient
  var recipient = staffEmail(data.to);
  if (recipient) {
    sendMessageNotificationEmail(recipient, {
      from:    data.from    || '',
      to:      data.to      || '',
      message: data.message || ''
    });
  }

  return createJsonOutput({ success: true, message: 'Message sent.', messageId: messageId, threadId: threadId });
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
      assignedTo:      row[11] || '',
      assessmentNotes: row[12] || '',
      status:          row[13] || '',
      lastUpdated:     row[14] instanceof Date ? row[14].toISOString() : row[14] || '',
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
      var recipient  = staffEmail(assignedTo);

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
      'HMIS ID:          ' + info.hmisId,
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
      'HMIS ID:           ' + info.hmisId,
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
      'HMIS ID:          ' + info.hmisId,
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
    var subject = 'New Message from ' + info.from + ' — HOPICS';
    var body = [
      'Hello,',
      '',
      'You have a new internal message in the HOPICS system.',
      '',
      'From:    ' + info.from,
      'Message: ' + info.message,
      '',
      'Please log in to the HOPICS Referral App to reply.',
      '',
      'Thank you,',
      'HOPICS Referral System'
    ].join('\n');

    MailApp.sendEmail(recipient, subject, body);
  } catch (e) {
    Logger.log('Failed to send message notification email: ' + e.toString());
  }
}

// ── Utility ───────────────────────────────────────────────────
function toTitleCase(str) {
  if (!str) return '';
  return String(str).replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}
