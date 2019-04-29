if(Meteor.isClient) {
	Accounts.ui.config({
		passwordSignupFields: 'USERNAME_AND_EMAIL'
	});
	isLoggedIn = function() {
		if(Meteor.user() != null)
		{
			return true;
		}

		return false;
	}
}
