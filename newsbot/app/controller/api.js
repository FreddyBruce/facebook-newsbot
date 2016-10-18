//api.js
var request = require('request');
var rssReader = require('feed-read');
var properties = require('../config/properties.js');

exports.tokenVerification = function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === properties.facebook_challenge) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
};

exports.handleMessage = function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });
    // Assume all went well.
//
// You must send back a 200, within 20 seconds, to let us know you've
// successfully received the callback. Otherwise, the request will time out.
res.sendStatus(200);
}
};

function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {
    var normalizedText = messageText.toLowerCase().replace(' ', '');

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (normalizedText) {
      case 'image':
        sendImageMessage(senderID);
        break;

      case 'button':
        sendButtonMessage(senderID);
        break;

      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'receipt':
        sendReceiptMessage(senderID);
        break;

      case 'showmore':
        getArticles(function(err, articles) {
          var maxArticles = Math.min(articles.length, 5);
          
          for (var i=0; i<maxArticles; i++) {
            sendTextMessage(senderID, articles[i]);
          }

      });
        break;


      default:
        getArticles(function(err, articles) {
          sendTextMessage(senderID, articles[0]);
        });


    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}



function getArticles(callback) {
  rssReader(properties.google_news_endpoint, function(err, articles) {
    if (err) {
      callback(err);
    } else {
      if (articles.length > 0) {
        callback(null, articles);
      } else {
        callback("no articles recieved");
      }
    }
  });
}

function sendTextMessage(recipientId, article) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type:"template",
        payload: {
          template_type:"generic",
          elements: [
            {
              title: article.title,
              subtitle: article.published.toString(),
              item_url: article.link
            }
          ]
        }
      }
    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: properties.facebook_message_endpoint,
    qs: { access_token: properties.facebook_token },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}
