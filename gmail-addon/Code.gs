var DESK_URL = 'https://premier-factory-pdf-converter.davidoxman63.chatgpt.site';

function token_() {
  var properties = PropertiesService.getUserProperties();
  var token = properties.getProperty('projectDeskToken');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    properties.setProperty('projectDeskToken', token);
  }
  return token;
}
function escapeText_(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function card_(title, section) {
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(title)).addSection(section).build();
}
function paragraph_(text) { return CardService.newTextParagraph().setText(escapeText_(text)); }
function action_(name, parameters) { return CardService.newAction().setFunctionName(name).setParameters(parameters || {}); }
function button_(text, name, parameters) { return CardService.newTextButton().setText(text).setOnClickAction(action_(name, parameters)); }
function input_(e, field) {
  var value = e.commonEventObject && e.commonEventObject.formInputs && e.commonEventObject.formInputs[field];
  return value && value.stringInputs ? value.stringInputs.value : [];
}
function api_(path, data) {
  var options = {method: data ? 'post' : 'get', headers: {Authorization: 'Bearer ' + token_()}, muteHttpExceptions: true};
  if (data) {options.contentType = 'application/json'; options.payload = JSON.stringify(data);}
  var response = UrlFetchApp.fetch(DESK_URL + '/api/pm/gmail/' + path, options);
  var result;
  try {result = JSON.parse(response.getContentText());} catch (error) {throw Error('Project Desk did not respond. Try again later.');}
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw Error(result.error || 'Could not connect to Project Desk.');
  return result;
}
function connectionCard_(error) {
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token_()).map(function(b) {return ('0' + ((b + 256) % 256).toString(16)).slice(-2);}).join('');
  var section = CardService.newCardSection().addWidget(paragraph_(error || 'Connect your Gmail add-on to Project Desk.'))
    .addWidget(paragraph_('Open the connection page, sign in, and click Connect Gmail. Then return here and click Refresh connection.'))
    .addWidget(CardService.newTextParagraph().setText('<a href="' + DESK_URL + '/pm#gmail-connect=' + hash + '">Open secure connection page</a>'))
    .addWidget(CardService.newTextButton().setText('Connect Project Desk').setOpenLink(CardService.newOpenLink().setUrl(DESK_URL + '/pm#gmail-connect=' + hash)))
    .addWidget(button_('Refresh connection', 'refreshConnection'));
  return card_('Connect Project Desk', section);
}
function onHomepage() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  try {api_('projects');return card_('Project Desk', CardService.newCardSection().addWidget(paragraph_('Connected. Open an email, then choose its project and items in this panel.')));}
  catch (error) {return connectionCard_(error.message);}
}
function onGmailMessage(e) {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  try {return projectsCard_(e.gmail.messageId, '', e);} catch (error) {return connectionCard_(error.message);}
}
function refreshConnection(e) {
  var card = e.gmail && e.gmail.messageId ? onGmailMessage(e) : onHomepage();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(card)).build();
}
function conversation_(e) {
  if (!e.gmail || !e.gmail.threadId || !e.gmail.accessToken) throw Error('Reopen Project Desk from the email to check its conversation.');
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var message=GmailApp.getMessageById(e.gmail.messageId);
  var ids=[message.getHeader('Message-ID') || message.getId()].concat((message.getHeader('References') || '').match(/<[^<>\s]+>/g) || [], (message.getHeader('In-Reply-To') || '').match(/<[^<>\s]+>/g) || []);
  message.getThread().getMessages().forEach(function(m){ids.push(m.getHeader('Message-ID') || m.getId());});
  return {threadId:e.gmail.threadId,messageIds:ids.filter(function(id,i){return ids.indexOf(id)===i;}).slice(-100)};
}
function locations_(e) {return api_('locations',conversation_(e));}
function savedLocations_(section, locations) {
  section.addWidget(paragraph_(locations.length ? 'Already saved to — this conversation' : 'No saved emails found for this conversation yet.'));
  locations.forEach(function(p) {
    section.addWidget(paragraph_('Project: '+p.name));
    section.addWidget(paragraph_('Items: '+p.items.map(function(i){return [i.itemnumber,i.name].filter(Boolean).join(' · ');}).join('; ')));
  });
}
function projectsCard_(messageId, search, e) {
  var locations=locations_(e);
  var projects = api_('projects').filter(function(p) {return p.name.toLowerCase().indexOf(search.toLowerCase()) >= 0;});
  var section = CardService.newCardSection();
  savedLocations_(section,locations);
  section.addWidget(paragraph_('1. Choose the project for this email.'))
    .addWidget(CardService.newTextInput().setFieldName('projectSearch').setTitle('Find project').setValue(search))
    .addWidget(button_('Search projects', 'findProjects', {messageId: messageId}));
  if (projects.length) {
    var menu = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('projectId').setTitle('Project');
    projects.sort(function(a,b){return Number(locations.some(function(p){return p.id===b.id;}))-Number(locations.some(function(p){return p.id===a.id;}));});
    projects.slice(0, 100).forEach(function(p, i) {var saved=locations.some(function(l){return l.id===p.id;});menu.addItem((saved?'Already saved here · ':'')+p.name + ' (' + (p.job_category || 'quoting') + ')', p.id, i === 0);});
    section.addWidget(menu).addWidget(button_('Choose items', 'chooseItems', {messageId: messageId}));
  } else section.addWidget(paragraph_('No matching projects. Try another search.'));
  if (projects.length > 100) section.addWidget(paragraph_('Showing the first 100 matches. Search to narrow the list.'));
  return card_('Log email to Project Desk', section);
}
function findProjects(e) {
  try {return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(projectsCard_(e.parameters.messageId, input_(e, 'projectSearch')[0] || '', e))).build();}
  catch (error) {return notice_(error.message);}
}
function chooseItems(e) {
  try {
    var project = input_(e, 'projectId')[0]; if (!project) return notice_('Choose a project first.');
    if(!e.gmail || e.gmail.messageId!==e.parameters.messageId)return notice_('The open email changed. Reopen Project Desk for this email.');
    var locations=locations_(e),saved=locations.filter(function(p){return p.id===project;})[0];
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(itemsCard_(project, e.parameters.messageId, '', saved?saved.items.map(function(i){return i.id;}):[], saved?'Previously linked items are checked. Review them, then log this new email.':''))).build();
  } catch (error) {return notice_(error.message);}
}
function itemsCard_(project, messageId, search, selectedIds, notice, includeAttachments) {
  selectedIds = selectedIds || [];
  var items = api_('items?project=' + encodeURIComponent(project)).filter(function(item) {return [item.itemnumber, item.name, item.manufacturer, item.model].join(' ').toLowerCase().indexOf(search.toLowerCase()) >= 0;});
  items.sort(function(a,b) {return String(a.itemnumber).localeCompare(String(b.itemnumber), undefined, {numeric:true});});
  var parameters = {project:project, messageId:messageId};
  var stages = api_('stages?project=' + encodeURIComponent(project));
  var section = CardService.newCardSection().addWidget(paragraph_('2. Select one or more items. Saving copies this open email to every selected item.'))
    .addWidget(CardService.newTextInput().setFieldName('itemSearch').setTitle('Find item number, name or model').setValue(search))
    .addWidget(button_('Search items', 'findItems', parameters));
  if (notice) section.addWidget(paragraph_(notice));
  if (items.length) {
    var selection = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName('itemIds').setTitle('Items (up to 50 per save)');
    items.slice(0,100).forEach(function(item) {selection.addItem([item.itemnumber,item.name,item.manufacturer,item.model].filter(Boolean).join(' · ') + ' — Stage: ' + (item.stage || 'Pending quote'),item.id,selectedIds.indexOf(item.id) >= 0);});
    section.addWidget(selection)
      .addWidget(CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName('attachments').setTitle('Email attachments').addItem('Include attachments (up to 10 files / 10 MB total)','yes',includeAttachments !== false))
      .addWidget(button_('Log email to selected items', 'logEmail', parameters));
    var stageMenu = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('newStage').setTitle('Change stage for selected items').addItem('Choose a stage', '', true);
    stages.forEach(function(stage) {stageMenu.addItem(stage.name, stage.name, false);});
    section.addWidget(stageMenu).addWidget(button_('Apply stage to selected items', 'changeItemStage', parameters));
  } else section.addWidget(paragraph_('No matching items in this project.'));
  if (items.length > 100) section.addWidget(paragraph_('Showing the first 100 matches. Search to narrow the list. Searching clears the item selection.'));
  return card_('Select equipment items',section);
}
function findItems(e) {
  try {return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(itemsCard_(e.parameters.project,e.parameters.messageId,input_(e,'itemSearch')[0] || ''))).build();}
  catch(error) {return notice_(error.message);}
}
function notice_(text) {return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text)).build();}
function logEmail(e) {
  try {
    var selected = input_(e,'itemIds');if (!selected.length || selected.length > 50) return notice_('Select between 1 and 50 items.');
    if (!e.gmail || e.gmail.messageId !== e.parameters.messageId) return notice_('The open email changed. Reopen Project Desk for this email.');
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var message = GmailApp.getMessageById(e.gmail.messageId), attachments = [], bytes = 0;
    if (input_(e,'attachments').indexOf('yes') >= 0) {
      var source = message.getAttachments({includeInlineImages:false,includeAttachments:true});
      if (source.length > 10) return notice_('More than 10 attachments. Turn off Include attachments and try again.');
      for (var i=0;i<source.length;i++) {var a=source[i],content=a.getBytes();bytes+=content.length;if(bytes>10*1024*1024)return notice_('Attachments exceed 10 MB. Turn off Include attachments and try again.');attachments.push({name:a.getName(),mime:a.getContentType(),base64:Utilities.base64Encode(content)});}
    }
    var body=message.getPlainBody();if(body.length>200000)return notice_('This email is too long to save (200,000 characters maximum).');
    var result = api_('log',{project:e.parameters.project,items:selected,message:{id:message.getHeader('Message-ID') || message.getId(),threadId:e.gmail.threadId,subject:message.getSubject(),from:message.getFrom(),to:[message.getTo(),message.getCc()].filter(Boolean).join('; Cc: '),date:message.getDate().toISOString(),body:body,url:'https://mail.google.com/mail/u/0/#all/'+message.getId(),attachments:attachments}});
    var section=CardService.newCardSection().addWidget(paragraph_(result.message)).addWidget(paragraph_('Selected items: '+selected.length+'. New copies added: '+result.added+'.'))
      .addWidget(CardService.newTextButton().setText('Open Project Desk').setOpenLink(CardService.newOpenLink().setUrl(DESK_URL+'/pm')));
    savedLocations_(section,locations_(e));
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card_('Email saved',section))).build();
  } catch(error) {return notice_(error.message);}
}

function changeItemStage(e) {
  try {
    var selected=input_(e,'itemIds'),stage=input_(e,'newStage')[0];
    if(!selected.length || selected.length>50)return notice_('Select between 1 and 50 items.');
    if(!stage)return notice_('Choose a stage first.');
    var result=api_('stage',{project:e.parameters.project,items:selected,stage:stage});
    var card=itemsCard_(e.parameters.project,e.parameters.messageId,input_(e,'itemSearch')[0] || '',selected,'Updated '+result.count+' selected items to '+result.stage+'. Email has not been logged.',input_(e,'attachments').indexOf('yes') >= 0);
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(card)).build();
  } catch(error) {return notice_(error.message);}
}
