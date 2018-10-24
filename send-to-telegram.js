var recievers = {
	"users": {
		"user1" : 111111111,
		"user2" : 222222222,
		"user3" : 333333333,
		"user4" : 444444444,
	},
	"groups": [
		-111111111,
		-222222222,
	]
};

var WEBHOOK_URL = "https://api.telegram.org/bot";
var BOT_TOKEN = ""; // Токен бота



var entities = require('@jetbrains/youtrack-scripting-api/entities');
var http = require('@jetbrains/youtrack-scripting-api/http');
var workflow = require('@jetbrains/youtrack-scripting-api/workflow');
var chats = {};

function send(chatId, text) {
	// Стандартный payload с синтаксисом markdown
	var payload = {
		"chat_id": chatId,
		"text": text,
		"parse_mode": "Markdown",
	};
	var connection = new http.Connection(WEBHOOK_URL + BOT_TOKEN + "/sendMessage", null, 2000);
	connection.addHeader("Content-Type", "application/json");
	var response = connection.postSync("", [], JSON.stringify(payload));
	if (!response.isSuccess) {
		console.warn('Failed to post notification to Telegram. Details: ' + response.toString());
	}
}

function findUserInText(textToSearch, issue, where) {
	var issueLink = '[' + issue.id + "](" + issue.url + ')';
	var mainChatId = recievers.users[issue.fields.Assignee.login];
	for (var login in recievers.users) {
		// Проверка на упоминание самого себя
		if (login != issue.reporter.login) {
			// Если упомянули кого-то из участников команды
			if (textToSearch.search("@" + login) != -1) {
				// Тект, что пользователя упомянули в комментарии
				var currentText = login + ", тебя упомянули в " + where + " к задаче " + issueLink;
				var chatId = recievers.users[login];
				if (chatId != mainChatId) {
					chats[chatId] = currentText;
				}
			}
		}
	}
}
exports.rule = entities.Issue.onChange({
	title: workflow.i18n('Send notification to Telegram when an issue is changed or commented'),
	guard: function(ctx) {
		// Условие простое. Если был оставлен комментарий (не удалён, а именно оставлен) либо изменилось описание задачи
		return  ctx.issue.becomesReported || ctx.issue.becomesUnresolved;
	},
	action: function(ctx) {
		var issue = ctx.issue;
		var issueLink = '[' + issue.id + "](" + issue.url + ')';
		var message, isNew;
		isNew = false;
		if (issue.becomesReported) {
			isNew = true;
		}
		message = issue.summary;
		var changedByName = '';
		var assigne = ctx.issue.fields.Assignee;
		if (isNew) {
			changedByName = issue.reporter.fullName;
		} else {
			changedByName = issue.updatedBy.fullName;
		}
		var mainChatId = recievers.users[assigne.login];
		var text = "";
		if (isNew) {
			text = assigne.login + ", на тебя была назначена новая задача\nНазначил: " + changedByName + "\nСсылка: " + issueLink + "\nСостояние: " + issue.fields.State.presentation + "\n" + "Приоритет: " + issue.fields.Priority.presentation + "\nНазвание: " + message;
			var issueText = issue.description;
			findUserInText(issueText, issue, "описании");
		} else {
			var isNewComment = issue.comments.isChanged;
			if (isNewComment) {
				text = "К задаче " + issueLink + " был добавлен новый комментарий:\n";
				var comments = issue.comments;
				comments.forEach(function(comment) {
					if (comment.isNew) {
						// Добавляем в текст сообщения текст комментария
						text += "```\n" + comment.text + "\n```";
						findUserInText(comment.text, issue, "комменарии");
					}
				});
			} else {
				text = assigne.login + ", задача " + issueLink + " была обновлена\nОбновил: " + changedByName;
			}
		}
		if (issue.reporter.login != assigne.login) { // Если задачу обновил тот, на кого она назначена
			chats[mainChatId] = text;
		}
	recievers.groups.forEach(function(chatId) {
			send(chatId, text); 
		});
		// ну и непосредственно отправка в чат
		for (var chatId in chats) {
			var textToSend = chats[chatId];
			send(chatId, textToSend);
		}
	},
	requirements: {}
});