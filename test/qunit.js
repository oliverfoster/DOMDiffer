$(function() {
    var diffed = $("#diffed")[0];
    var template = $("#template")[0];

    var dd = new DOMDiffer({
        ignoreAttributes: [
            "height",
            "width",
            "complete"
        ]
    }); 
    var UnitTemplate;

    Handlebars.registerHelper("if_equals", function(value, text, block) {
        if (value === text) {
            return block.fn(this);
        } else {
            return block.inverse(this);
        }
    });

    $.get("qunit.hbs", function(data) {
        UnitTemplate = Handlebars.compile(data);
        startTesting();
    });


    var changes = [
        "simple-empty",
        "simple-one-div",
        "simple-one-div-class",
        "simple-one-div-class-id",
        "simple-one-div-class-id-attribute",
        "simple-nestinnew",
        "simple-nestinnew-duplicate-spacing",
        "complex-general-new-nesting",
        "complex-general-new-nesting-move",
        "complex-flatten",
        "complex-change-classes",

        "complex-narrative-1",
        "complex-narrative-2",
        "complex-narrative-3",

        "complex-hotgraphic-1",
        "complex-hotgraphic-2",
        "complex-hotgraphic-3",
        "complex-hotgraphic-4",
        "complex-hotgraphic-5",

        "complex-accordion-1",
        "complex-accordion-2",
        "complex-accordion-3",
        "complex-accordion-4",
        "complex-accordion-5",
    ];


    var testDelay = 1;

    function startTesting() {

        var runOverall = 0;

        for (var i = 0, l = changes.length; i < l; i++) {

            runOverall+=testDelay;
            bindTestContext("In sequence",i, runOverall);

        }
        
        for (var i = changes.length-1, l = -1; i > l; i--) {

            runOverall+=testDelay;
            bindTestContext("In sequence backward",i, runOverall);

        }

        for (var c = 0, cl = 100; c < cl; c++) {

            var i = Math.floor(Math.random() * changes.length);

            runOverall+=testDelay;
            bindTestContext("Random 100", i, runOverall);

        }

    }

    var currentModule = "";

    function bindTestContext(moduleName, i, runAt) {
        var test = function() {
            
            if (currentModule !== moduleName) {
                console.log("change module", moduleName);
                currentModule = moduleName;
                QUnit.module(moduleName);
            }

            QUnit.test( changes[i]  + "(" + runAt +")", function( assert ) {
                performDiff({
                    change: changes[i]
                }, assert);
            });

        };
        if (runAt !== 0) {
            setTimeout(test, runAt);
        } else {
            test();
        }
    }

    var count = 1;
    var longest = 0;
    function performDiff(context, assert) {
        var templateString = UnitTemplate(context);
        var templateNode = dd.stringToNode(templateString);

        //capture start time
        var start = (new Date()).getTime();

        //perform test
        var diff = dd.nodeUpdateNode(diffed, templateNode, {test:true, forDebug: true, errorOnFail: true, ignoreContainer:true, returnDiff: true});
        

        //capture total elapsed time
        var time = (new Date()).getTime() - start;
        
        //console log and show changes
        if (time > longest) longest = time;
        console.log(count++, context.change, time+"ms", diff.length+"diffs", diff);
        console.log("longest", longest);
        template.innerHTML = diffed.outerHTML;

        //reply to test assert
        assert.ok(true, "passed in " + time + "ms, made " + diff.length + " changes. TEMPLATE: "+templateString);

    }
});