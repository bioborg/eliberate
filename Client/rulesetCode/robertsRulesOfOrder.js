import utils from '../lib/util.js';

if(Meteor.isClient) {
	SubmittedCommands = [];
	var LastMeetingPart = '';
	var isCommandSelected = new ReactiveVar(false);
	isSubmittedCommandsPopulated = new ReactiveVar(false);
	isTyping = false;

	// Subsequent motions rely on the qualities of the last motion.
	GetLastCommand = function() {
		return SubmittedCommands[SubmittedCommands.length - 1];
	}

	showModal = utils.showModel;

	// Checks to see if the meeting is currently in a motion.
	// Certain commands can only be used if we are dealing with an open motion.
	IsInMotion = function() {
		var currentMotion = CurrentMotion();

		return currentMotion != undefined;
	}

	CurrentOrderOfPresedence = function() {
		var currentMotion = CurrentMotion();

		if(currentMotion == undefined)
		{
			return Number.MAX_VALUE;
		}

		return currentMotion.orderOfPresedence;
	}

	// Gets the current motion if you need it
	CurrentMotion = function() {
		var currentMotion = Messages.find({meetingId: Session.get("meetingId"), status: { $nin: [ MOTIONSTATUS.approved, MOTIONSTATUS.denied, MOTIONSTATUS.killed, MOTIONSTATUS.postponed, MOTIONSTATUS.none ]}, commandType: { $in: GetMotionTypes() }}, {limit: 1, sort: { dateTime: -1 }}).fetch();

		return currentMotion.length == 0 ? undefined : CreateCommandInstance(GetCommandPrototype(currentMotion[0].commandType), Meetings.find({_id: Session.get("meetingId")}).fetch()[0], Organizations.find({_id: Session.get("organizationId")}).fetch()[0], currentMotion[0].statement, currentMotion[0].userId, currentMotion[0].userName, currentMotion[0].dateTime, currentMotion[0]);
	}

	// Get the parent of the current motion
	CurrentParentMotion = function() {
		var currentParentMotion;
		var currentMotion;

		for(var index = 0; index < SubmittedCommands.length; index++)
		{
			if(SubmittedCommands[index].isMotion
				&& SubmittedCommands[index].status != MOTIONSTATUS.approved
				&& SubmittedCommands[index].status != MOTIONSTATUS.denied
			  && SubmittedCommands[index].status != MOTIONSTATUS.killed
				&& SubmittedCommands[index].status != MOTIONSTATUS.postponed
				&& SubmittedCommands[index].status != MOTIONSTATUS.none) {
					if(currentMotion != undefined
						 && (SubmittedCommands[index].meetingPart == MEETINGPARTS.subsidiary
						 	|| SubmittedCommands[index].meetingPart == MEETINGPARTS.incidental)) { // Only subsidiary and incidental motions can have parents
						currentParentMotion = currentMotion;
					}
					currentMotion = SubmittedCommands[index];
			}
			else if (SubmittedCommands[index].closesMotion) {
				currentMotion = undefined;
			}
		}

		return currentParentMotion;
	}

	// Gets a motion
	GetMotion = function(motionId) {
		for(var index = 0; index < SubmittedCommands.length; index++)
		{
			if(SubmittedCommands[index]._id == motionId) {
				return SubmittedCommands[index];
			}
		}
	}

	HasTheFloor = function(userId) {
		var currentMotion = CurrentMotion();
		var queue;
		if(currentMotion != undefined)
		{
			 queue = Queues.find({meetingId: Session.get("meetingId"), motionId: currentMotion._id, recognized: { $exists: true }, hasSpoken: false}, {sort: { recognized: -1 }}).fetch();
		}
		else
		{
			queue = Queues.find({meetingId: Session.get("meetingId"), motionId: {"$exists": false }, recognized: { $exists: true }, hasSpoken: false}, {sort: { recognized: -1 }}).fetch();
		}

		if(queue.length > 0) {
			if(queue[0].userId == userId)
			{
				return true;
			}
		}

		return false;
	}

	// Checks for quorum
	HaveQuorum = function() {
		var meeting = Meetings.findOne({_id: Session.get("meetingId")});
		var attendanceCount = Attendees.find({meetingId: meeting._id}).count();
		var members = Permissions.find({organizationId: meeting.organizationId, role: { $nin: [ ROLES.guest ]}}).count();

		if(attendanceCount / members >= .5)
		{
			return true;
		}

		return false;
	}

	IsCommandSelected = function() {
		return isCommandSelected.get();
	}

	// Loads up the SubmittedCommands array when you join a meeting
	$(document).on("joinedMeeting", function() {
		SubmittedCommands = [];
	});

	Template.robertsRulesOfOrderMessages.onCreated(function () {
		this.subscribe("messages", Session.get("meetingId"));
		this.subscribe("queues", Session.get("meetingId"));
		this.subscribe("votes", Session.get("meetingId"));
	});

	Template.robertsRulesOfOrderTools.helpers({
		agenda: function() {
			return Agendas.find({meetingId: Session.get("meetingId")});
		},

		agendaOccurred: function() {
			if(this.status == AGENDASTATUS.ended
				 || this.status == AGENDASTATUS.active)
				 {
					 return true;
				 }
			return false;
		},

		statusIcon: function() {
			switch(this.status) {
				case AGENDASTATUS.pending:
					return "fa-square-o";
				case AGENDASTATUS.active:
					return "fa-star";
				case AGENDASTATUS.ended:
					return "fa-check-square-o";
			}
		},

		hasTheFloor: function() {
			return HasTheFloor(this.userId == undefined ? Meteor.userId() : this.userId);
		},

		isChairperson: function() {
			return Session.get("role") == ROLES.chairperson;
		},

		queue: function() {
			var currentMotion = CurrentMotion();
			if(currentMotion != undefined)
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: currentMotion._id, hasSpoken: false}, {sort: { recognized: -1 }});
			}
			else
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: { $exists: false }, hasSpoken: false}, {sort: { recognized: -1 }});
			}
		},

		canRemoveFromQueue : function() {
			return Session.get("role") == ROLES.chairperson || this.userId == Meteor.userId();
		},

		userFloorCount : function() {
			var currentMotion = CurrentMotion();
			if(currentMotion != undefined)
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: currentMotion._id, hasSpoken: true, userId: this.userId}).count();
			}
			else
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: { $exists: false }, hasSpoken: true, userId: this.userId}).count();
			}
		},

		queueCount : function() {
			var currentMotion = CurrentMotion();
			if(currentMotion != undefined)
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: currentMotion._id, hasSpoken: false}).count();
			}
			else
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: { $exists: false }, hasSpoken: false}).count();
			}
		}
	});

	Template.robertsRulesOfOrderTools.events({
		'click #removeFromQueue': function() {
			Queues.remove({_id: this._id});
		},

		'click #recognize': function() {
		  Queues.update({_id: this._id}, { $set: { recognized: new Date() }});
		},

		'change #commandSelected': function() {
			if($('#commandSelected').selectedValue == "Amendment")
			{
				$('#newMessage').val(CurrentMotion().statement);
			}
			else {
				$('#newMessage').val('');
			}
		}
	});

	/* eLiberate Constants */
	Template.robertsRulesOfOrderMessages.helpers({
		meetingId: function() {
			return Session.get("meetingId") || 0;
		},

		meetingMessages: function() {
			BuildSubmittedCommands();
			return SubmittedCommands;
		},

		commandTemplate: function() {
			return this.commandType + "Command";
		},

		canRemoveFromQueue : function() {
			return Session.get("role") == ROLES.chairperson || this.userId == Meteor.userId();
		},

		isChairperson: function() {
			return Session.get("role") == ROLES.chairperson;
		},

		userFloorCount : function() {
			var currentMotion = CurrentMotion();
			if(currentMotion != undefined)
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: currentMotion._id, hasSpoken: true, userId: this.userId}).count();
			}
			else
			{
				return Queues.find({meetingId: Session.get("meetingId"), motionId: { $exists: false }, hasSpoken: true, userId: this.userId}).count();
			}
		},

		CurrentMessageLevel: function() {
			var messageId = this._id;
			var level = 0;

			for(var index = 0; index < SubmittedCommands.length; index++)
			{
				if(SubmittedCommands[index].isMotion
					&& SubmittedCommands[index].status != MOTIONSTATUS.approved
					&& SubmittedCommands[index].status != MOTIONSTATUS.denied
					&& SubmittedCommands[index].status != MOTIONSTATUS.killed
					&& SubmittedCommands[index].status != MOTIONSTATUS.postponed
					&& SubmittedCommands[index].status != MOTIONSTATUS.none) {
						if(currentMotion != undefined
							 && (SubmittedCommands[index].meetingPart == MEETINGPARTS.subsidiary
								|| SubmittedCommands[index].meetingPart == MEETINGPARTS.incidental)) { // Only subsidiary and incidental motions can have parents
							level++;
						}
				}
				else if (SubmittedCommands[index].closesMotion) {
					level--;
				}

				if(SubmittedCommands[index]._id == messageId)
				{
					break;
				}
			}

			return level;
		}
	});

	BuildSubmittedCommands = function() {
		var currentMotion;
		var currentParentMotion;
		var depth = 0;
		SubmittedCommands = [];
		meeting = Meetings.findOne({_id: Session.get("meetingId")});
		organization = Organizations.findOne({_id: meeting.organizationId});
		messagesSubmitted = Messages.find({meetingId: Session.get("meetingId")}).fetch();

		for(var index = 0; index < messagesSubmitted.length; index++)
		{
			var commandPrototype = GetCommandPrototype(messagesSubmitted[index].commandType);
			var command = CreateCommandInstance(commandPrototype, meeting, organization, messagesSubmitted[index].statement, messagesSubmitted[index].userId, messagesSubmitted[index].userName, messagesSubmitted[index].dateTime, messagesSubmitted[index]);

			command.depth = depth;

			SubmittedCommands.push(command);

			if (command.commandType == "PutToVote" ||
					command.commandType == "Kill") {
				depth--;
			}
			else if(command.isMotion)
			{
				currentMotion = command;
				depth++;
			}

		}
		isSubmittedCommandsPopulated.set(true);
	}

	Template.robertsRulesOfOrderVotableCommand.helpers({
		needsSecond: function() {
			if(this.status == MOTIONSTATUS.second)
			{
				return true;
			}

			return false;
		},

		canKillMotion: function() {
			if(Session.get("role") == ROLES.chairperson
				 && this.status == MOTIONSTATUS.second)
			{
				return true;
			}

			return false;
		},

		motionNotSeconded: function() {
			return this.status == MOTIONSTATUS.notSeconded;
		},

		canSecond: function() {
			if(this.userId === Meteor.userId())
			{
				return false;
			}

			return true;
		},

		seconded: function() {
			if(this.secondedBy != undefined)
			{
				return true;
			}

			return false;
		},

		killed: function() {
			return this.status == MOTIONSTATUS.killed;
		}
	});

	Template.robertsRulesOfOrderHeader.helpers({
		isInDebate: function() {
			var currentMotion = Messages.find({meetingId: Session.get("meetingId"), status: { $nin: [ MOTIONSTATUS.approved, MOTIONSTATUS.denied, MOTIONSTATUS.killed, MOTIONSTATUS.postponed, MOTIONSTATUS.none ]}, commandType: { $in: GetMotionTypes() }}, {limit: 1, sort: { dateTime: -1 }}).fetch();

			if(currentMotion.length == 0)
			{
				currentMotion = undefined;
			}
			else {
				currentMotion = CreateCommandInstance(GetCommandPrototype(currentMotion[0].commandType), Meetings.find({_id: Session.get("meetingId")}).fetch()[0], Organizations.find({_id: Session.get("organizationId")}).fetch()[0], currentMotion[0].statement, currentMotion[0].userId, currentMotion[0].userName, currentMotion[0].dateTime, currentMotion[0]);
			}

			if(isSubmittedCommandsPopulated.get() && currentMotion != undefined) // isSubmittedCommandsPopulated is another hack to get this to update after SubmittedCommands is populated
			{
				return currentMotion.status == MOTIONSTATUS.debate ? "In Debate" : "Not In Debate";
			}
			else
			{
				return Meetings.findOne({_id: Session.get("meetingId")}).inDebate ? "In Debate" : "Not In Debate";
			}
			return "Not In Debate";
		}
	})

	Template.robertsRulesOfOrderVotableCommand.events({
		'click #second': function() {
			var status = "";
			status = MOTIONSTATUS.seconded;

			this.status = status;
			Messages.update({_id: this._id}, {$set: {status: status, secondedBy: Meteor.user().username, secondedById: Meteor.userId()}});
		},

		'click #killMotion': function() {
			var currentMotion = CurrentMotion();
			Messages.update({_id: this._id}, {$set: {status: MOTIONSTATUS.killed}});
			CreateCommandInstance(GetCommandPrototype("Kill"), Meetings.find({_id: Session.get("meetingId")}).fetch()[0], Organizations.find({_id: Session.get("organizationId")}).fetch()[0], currentMotion[0].statement, currentMotion[0].userId, currentMotion[0].userName, currentMotion[0].dateTime, currentMotion[0]).execute();
			TallyVote(this);
		}
	});

	Template.PutToVoteCommand.helpers({

		requiresVote: function() {
			if(this.status == MOTIONSTATUS.toVote
			   && Votes.find({motionId: this._id, userId: Meteor.userId()}).count() == 0)
			{
				return true;
			}

			return false;
		},

		canVote: function() {
			if(Votes.find({motion: this._id, userId: Meteor.userId()}).count() > 0)
			{
				return true;
			}

			return false;
		},

		yourVote: function() {
			var vote = Votes.findOne({motionId: this._id, userId: Meteor.userId()});
			if(vote != undefined)
			{
				return vote.voteOption;
			}
			return ''
		},

		inVote: function() {
			if(this.status == MOTIONSTATUS.toVote)
			{
				return true;
			}

			return false;
		},

		approved: function() {
			if(this.status == MOTIONSTATUS.approved)
			{
				return true;
			}

			return false;
		},

		denied: function() {
			if(this.status == MOTIONSTATUS.denied)
			{
				return true;
			}

			return false;
		},

		motionPutToVote: function() {
			return this.motionPutToVote;
		},

		isChairperson: function() {
			return Session.get("role") == ROLES.chairperson;
		},

		notYetRatified: function() {
			return this.ratified != true;
		},

		killed: function() {
			if(this.status == MOTIONSTATUS.killed)
			{
				return true;
			}

			return false;
		}
	});

	Template.PutToVoteCommand.events({
		'click #aye': function() {
			if(Votes.find({motionId: this._id, userId: Meteor.userId()}).count() == 0)
			{
				Votes.insert({motionId: this._id, userId: Meteor.userId(), userName: Meteor.user().username, meetingId: this.meeting._id, voteOption: VOTEOPTIONS.aye});
				Messages.update({_id: this._id}, {$inc: {aye: 1}});
				TallyVote(this);
			}
		},

		'click #nay': function() {
			if(Votes.find({motionId: this._id, userId: Meteor.userId()}).count() == 0)
			{
				Votes.insert({motionId: this._id, userId: Meteor.userId(), userName: Meteor.user().username, meetingId: this.meeting._id, voteOption: VOTEOPTIONS.nay});
				Messages.update({_id: this._id}, {$inc: {nay: 1}});
				TallyVote(this);
			}
		},

		'click #abstain': function() {
			if(Votes.find({motionId: this._id, userId: Meteor.userId()}).count() == 0)
			{
				Votes.insert({motionId: this._id, userId: Meteor.userId(), userName: Meteor.user().username, meetingId: this.meeting._id, voteOption: VOTEOPTIONS.abstain});
				Messages.update({_id: this._id}, {$inc: {abstain: 1}});
				TallyVote(this);
			}
		},

		'click #ratify': function(motion) {
			Messages.update({_id: this._id}, {$set: { ratified: true}});
			this.motionPutToVote = CreateCommandInstance(GetCommandPrototype(this.motionPutToVote.commandType), Meetings.findOne({_id: Session.get("meetingId")}), Organizations.findOne({_id: Session.get("organizationId")}), this.motionPutToVote.statement, this.motionPutToVote.userId, this.motionPutToVote.userName, this.motionPutToVote.dateTime, this.motionPutToVote);

			if(this.motionPutToVote != undefined && this.motionPutToVote.approved != undefined)
			{
				this.motionPutToVote.approved()
			}
		},

		'click #kill-vote': function() {
			var currentMotion = CurrentMotion();
			Messages.update({_id: this._id}, {$set: {status: MOTIONSTATUS.killed}});
			CreateCommandInstance(GetCommandPrototype("Kill"), Meetings.find({_id: Session.get("meetingId")}).fetch()[0], Organizations.find({_id: Session.get("organizationId")}).fetch()[0], currentMotion[0].statement, currentMotion[0].userId, currentMotion[0].userName, currentMotion[0].dateTime, currentMotion[0]).execute();
		}
	});

	TallyVote = function(motion) {
		var meeting = Meetings.findOne({_id: Session.get("meetingId")});
		var attendanceCount = Attendees.find({meetingId: meeting._id}).count();
		var voteCount = Votes.find({motionId: motion._id}).count();
		var ayeCount = Votes.find({motionId: motion._id, voteOption: VOTEOPTIONS.aye}).count();

		// So the vote type info is available
		this.motionPutToVote = CreateCommandInstance(GetCommandPrototype(motion.motionPutToVote.commandType), Meetings.findOne({_id: Session.get("meetingId")}), Organizations.findOne({_id: Session.get("organizationId")}), motion.motionPutToVote.statement, motion.motionPutToVote.userId, motion.motionPutToVote.userName, motion.motionPutToVote.dateTime, motion.motionPutToVote);

		if(voteCount == attendanceCount)
		{
			if((motion.motionPutToVote.voteType == VOTETYPES.simpleMajority && ayeCount / attendanceCount >= .5)
				|| (motion.motionPutToVote.voteType == VOTETYPES.twoThirdsMajority && ayeCount / attendanceCount >= .66))
			{
				Messages.update({_id: motion._id}, {$set: {status: MOTIONSTATUS.approved}});
				Messages.update({_id: motion.motionPutToVote._id}, {$set: {status: MOTIONSTATUS.approved}});
				motion.status = MOTIONSTATUS.approved;
				BuildSubmittedCommands();
				return true;
			}
			else
			{
				motion.status = MOTIONSTATUS.denied;
				Messages.update({_id: motion._id}, {$set: {status: MOTIONSTATUS.denied}});
				Messages.update({_id: motion.motionPutToVote._id}, {$set: {status: MOTIONSTATUS.denied}});
				BuildSubmittedCommands();
			}
		}

		BuildSubmittedCommands();

		return false;
	}

	Template.robertsRulesOfOrderControls.helpers({
		isChairperson: function() {
			return Session.get("role") == ROLES.chairperson;
		},

		pending: function() {
			return Meetings.findOne({_id: Session.get("meetingId")}).status == MEETINGSTATUS.pending;
		},

		calledToOrder: function() {
			return Meetings.findOne({_id: Session.get("meetingId")}).status == MEETINGSTATUS.started
						|| Session.get("role") == ROLES.chairperson;
		},

		adjourned: function() {
			return Meetings.findOne({_id: Session.get("meetingId")}).status == MEETINGSTATUS.ended;
		},

		startDateTime: function() {
			return Meetings.findOne({_id: Session.get("meetingId")}).startDateTime;
		},

		endDateTime: function() {
			return Meetings.findOne({_id: Session.get("meetingId")}).endDateTime;
		},

		hasTheFloor: function() {
			return HasTheFloor(this.userId == undefined ? Meteor.userId() : this.userId);
		},

		allowToSubmit: function() {
			var currentMotion = CurrentMotion();
			if((HasTheFloor(Meteor.userId()) && IsCommandSelected() && (currentMotion == undefined || (currentMotion.status != MOTIONSTATUS.second && currentMotion.status != MOTIONSTATUS.toVote)))
				 || Session.get("role") == ROLES.chairperson && IsCommandSelected())
			 {
				 	return "";
			 }

			 return "disabled";
		},

		attendingCount: function() {
			return Meetings.findOne({_id: Session.get("meetingId")}).attendance;
		},

		commands: function() {
			return CommandResolver.visitValidCommands(Messages.find({meetingId: Session.get("meetingId")}).fetch());
		},

		actionDisabled: function() {
			if(!this.isActive)
			{
				return "disabled";
			}

			return "";
		},

		seperator: function() {
			seperatorHtml = "";
			if(this.meetingPart != LastMeetingPart
				|| LastMeetingPart == "") {
				seperatorHtml = "<li class='separator'><h4>" + this.meetingPart + "</h4></li>";
			}

			LastMeetingPart = this.meetingPart

			return seperatorHtml;
		},

		typers: function() {
			return Attendees.find({meetingId: Session.get("meetingId"), typing: true, userId: { $ne: Meteor.userId() }});
		},

		tooltipTag: function() {
			return {
	      tooltip: this.tooltip,
    	}
		}
	});

	Template.robertsRulesOfOrderControls.rendered = function() {
	  $('[data-toggle="tooltip"]').tooltip();
	}

	Template.robertsRulesOfOrderControls.events({

		'click #newMessageSubmit': function() {
			// We have to clear out the queue first thing otherwise we end up clearing out the NEW motion's queue, not the old one.
			var currentMotion = CurrentMotion();
			var queue;
			if(currentMotion != undefined)
			{
				queue = Queues.findOne({meetingId: Session.get("meetingId"), userId: Meteor.userId(), motionId: currentMotion._id, hasSpoken: false});
			}
			else
			{
				queue = Queues.findOne({meetingId: Session.get("meetingId"), userId: Meteor.userId(), motionId: { $exists: false }, hasSpoken: false});
			}

			if(queue != undefined)
			{
				Queues.update({_id: queue._id}, { $set: { hasSpoken: true }});
			}

			var attendeeId = Attendees.findOne({meetingId: Session.get("meetingId"), userId: Meteor.userId() });
			Attendees.update({_id: attendeeId._id}, {$set: {typing: false}});

			CommandResolver.submitCommand();

			// Clear out the command controls
			$("#newMessage").val('');
			$("#commandSelected").text('Actions');
			isCommandSelected.set(false);
		},

		'click #commandDropdown ul li:not(.disabled):not(.separator)': function() {
			$('#command').val(this.commandName);
			$('#commandSelected').html(this.commandName);
			isCommandSelected.set(true);
		},

		'click #messagePreviewButton': function() {
			Session.set("preview", $('#newMessage').val());
			showModal($("#messagePreviewButton"));
		},

		'click #requestTheFloor': function() {
			var currentMotion = CurrentMotion();
			if(currentMotion != undefined)
			{
				Queues.insert({meetingId: Session.get("meetingId"), userId: Meteor.userId(), userName: Meteor.user().username, motionId: currentMotion._id, hasSpoken: false});
			}
			else
			{
				Queues.insert({meetingId: Session.get("meetingId"), userId: Meteor.userId(), userName: Meteor.user().username, hasSpoken: false});
			}

		},

		'keydown #newMessage': function() {
			if($('#newMessage').val() != '' && !isTyping) {
				var attendee = Attendees.findOne({meetingId: Session.get("meetingId"), userId: Meteor.userId()});
				Attendees.update({ _id: attendee._id }, { $set: { typing: true } })
				isTyping = true;
			}
			else if($('#newMessage').val() == '') {
				var attendee = Attendees.findOne({meetingId: Session.get("meetingId"), userId: Meteor.userId()});
				Attendees.update({ _id: attendee._id }, { $set: { typing: false } })
				isTyping = false;
			}
		},

		'click .dropdown-menu > li': function(e) {
			// var command = GetCommandPrototype($('#commandSelected li')[0].innerText);
			var command = GetCommandPrototype(e.target.innerText);
			if(command.selected != undefined)
			{
				command.selected($('#newMessage'), CurrentMotion());
			}
		}
	});

	Template.robertsRulesOfOrderStandardCommand.onRendered(function(){
		window.scrollTo(0,document.body.scrollHeight);
		$('.message').last().stop(true, true).effect("highlight", {duration: 1000});
	});

	Template.robertsRulesOfOrderVotableCommand.onRendered(function(){
		window.scrollTo(0,document.body.scrollHeight);
		$('.message').last().stop(true, true).effect("highlight", {duration: 1000});
	});

	Template.PutToVoteCommand.onRendered(function(){
		window.scrollTo(0,document.body.scrollHeight);
		$('.message').last().stop(true, true).effect("highlight", {duration: 1000});
	});

	Template.OpenAgendaItemCommand.onRendered(function(){
		window.scrollTo(0,document.body.scrollHeight);
		$('.message').last().stop(true, true).effect("highlight", {duration: 1000});
	});

	Template.MakeAStatementCommand.onRendered(function(){
		window.scrollTo(0,document.body.scrollHeight);
		$('.message').last().stop(true, true).effect("highlight", {duration: 1000});
	});
}
