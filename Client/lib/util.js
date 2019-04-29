if (Meteor.isClient) {

    showModal = function(e) {
        var modalView = $(e).attr("data-modal");
        $("article").hide();
        $("article#modal-" + modalView).show();
        if ($("#modal-nav").is(":visible")){

        } else {
            $("#sidebar-wrapper").removeClass("active");
            $("#modal-nav").slideDown("slow");
            $("#modal-nav").addClass("active");
            $("#menu-toggle").hide();
        }
    }

}
