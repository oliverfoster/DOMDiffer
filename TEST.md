[Simple jsfiddle](https://jsfiddle.net/b6Lf8n6h/)


HTML

<button id="update">
Perform Differential Update
</button>

<div id="wrapper">

  <div class="container changemycontent template">
    <div>
      testing stuffs
    </div>
    Lorem​Ipsum dfsdf asfasdf dfgsdf gsdfg
  </div>

  <div class="container shouldmatchabove dom">
    LoremIpsum
  </div>
  
</div>



JAVASCRIPT

$(function() {
	//create DOMDiffer instance
  	var ddInstance = new DOMDiffer();

	//capture 'fake' template and dom
  	var $template = $($("#wrapper > .container")[0]);
  	var $dom = $($("#wrapper > .container")[1]);

	$("#update").on("click", function() {

	    var start = (new Date()).getTime();

	    try {
	      var diff = ddInstance.nodeUpdateNode($dom[0], $template[0], {
	        test: false,
	        errorOnFail: true,
	        ignoreContainer: true,
	        returnDiff: true
	      });
	    } catch (e) {
	      alert("Diffing failed, please report this to oliver.foster@kineo.com");
	    }

	    console.log("DOMDiffer - nodeUpdateNode took", ((new Date()).getTime() - start), "ms", "performed", diff.length, "changes");
	    
   });

});



CSS

.container:nth-child(1) {
  background-color: yellow;
}

.container:nth-child(1):before {
  font-weight: bold;
  font-family: sans-serif;
  content: "Template:"
}

.container:nth-child(2) {
  background-color: red;
}

.container:nth-child(2):before {
  font-weight: bold;
  font-family: sans-serif;
  content: "DOM:"
}
