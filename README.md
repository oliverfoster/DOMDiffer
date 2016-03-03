# DOMDiffer

React-style DOM updates for MVC+Template frameworks. ie8+ compatible.

#####Inclusion - Global
```html
<script src="DOMDiffer.js"></script>
```
```javascript
var ddInstance = new DOMDiffer({
  /* options here */
});
```
#####Inclusion - Require
```html
<script src="require.js"></script>
```
```javascript
require(['./DOMDiffer'], function(DOMDiffer) {
  var ddInstance = new DOMDiffer({
    /* options here */
  });
});
```

#####Simple example:
```javascript

require(['DOMDiffer'], function(DOMDiffer) {

  var ddInstance = new DOMDiffer({
    /* options here */
  });

  var renderedTemplateString = '<div class="class1"></div>';
  var templateNode = ddInstance.stringToNode(renderedTemplateString);

  var nodeInDocument = document.getElementById("node1");
  
  ddInstance.nodeUpdateNode( nodeInDocument, templateNode );
  
});


```

#####Slightly more verbose example 1:
```javascript

require(['DOMDiffer'], function(DOMDiffer) {

  var ddInstance = new DOMDiffer({
    /* options here */
  });
  
  var renderedTemplateString = '<div class="class1"></div>';
  var templateNode = ddInstance.stringToNode(renderedTemplateString);

  var nodeInDocument = document.getElementById("node1");

  var diff = ddInstance.nodesDiff( nodeInDocument, templateNode );
  ddInstance.nodeApplyDiff( nodeInDocument, diff);
  

});


```

#####Slightly more verbose example 2:
```javascript

require(['DOMDiffer'], function(DOMDiffer) {

  var ddInstance = new DOMDiffer({
    /* options here */
  });
  
  var renderedTemplateString = '<div class="class1"></div>';
  var templateNode = ddInstance.stringToNode(renderedTemplateString);

  var nodeInDocument = document.getElementById("node1");
  
  var vNodeRenderedTemplate = ddInstance.nodeToVNode(templateNode);
  var vNodeNodeInDocument = ddInstance.nodeToVNode(nodeInDocument);

  var diff = ddInstance.vNodesDiff( vNodeInDocument, vNodeRenderedTemplate );
  ddInstance.vNodeApplyDiff( vNodeNodeInDocument, diff);
  

});


```

###Explanation:

1. TreeA & TreeB get flattened into a pile of nodes
2. Each node from TreeA gets compared to each node from TreeB and given a percentage score of similarity
3. Pairs are made of the TreeA nodes and TreeB nodes that match
4. The Pairs are removed from the piles of nodes by their highest match value
5. Left-over nodes from TreeA are marked for deletion
6. Left-over nodes from TreeB are marked as additions
7. New TreeA nodes are made for each addition and linked to the right point in TreeA
8. The original TreeB node and the new TreeA node are added to the Pairs list
9. The differences between the nodes in each Pair is found
10. TreeB is then rebuilt piece by piece from the Pairs
11. Any additional placement changes required are added to each of the Pairs (which are now really Diffs)
12. From the rebuilding process comes out only the Pairs with changes forming the differential of TreeA and TreeB
13. Applying the differential to TreeA will perform only the changes necessary to make TreeA identical to TreeB
14. Scrap all of your DOM manipulation code

###API

#####Options
| Name | Type | Description |
| --- | --- | --- |
| ``ignoreAttributes`` | ``Array`` | Attributes to ignore, like ``["data", "value", "selected", "checked"]`` if you want to ignore form input values |
| ``ignoreAttributesWithPrefix`` | ``Array`` | Prefix of attributes to ignore, like ie8 ``jquery`` and ``sizzle`` attributes. Default ``["jquery", "sizzle"]`` |
| ``ignoreClasses`` | ``Array`` | Classes to ignore |
| ``ignoreSubTreesWithAttributes`` | ``Array`` | Allows the differ to ignore any child nodes of parents having certain attributes. Allows for sub views. Default ``["view-container"]`` |
| ``ignoreContainer`` | ``Boolean`` | Globally sets the ``nodeDiff``, ``vNodeDiff``, ``nodesAreEqual`` and  ``vNodesAreEqual`` to ignore their container |

####Functions
| Name | Returns | Description |
| ------------------------------------ | --- | --- |
| ``setOptions(options);`` | ``undefined`` | Allows instance options to be undated and processed |
| ``nodeToVNode(node);`` | ``Object`` | Returns a ``vNode`` object tree representing the dom ``node`` and its children positions in the tree |
| ``vNodeToNode(node);`` | ``Node`` | The opposite of the above function |
| ``nodesDiff(node1, node2, options);`` | ``Array`` | Returns an array of objects describing the differences between the ``nodes``. ``{ignoreContainer: true}`` |
| ``vNodesDiff(vNode1, vNode2, options);`` | ``Array`` | Returns an array of objects describing the differences between the ``vNodes``. ``{ignoreContainer: true}`` |
| ``nodeDiffApply(node1, diff, options);`` | ``Object`` | Returns the ``vNode`` of ``node1`` with the ``diff`` applied and applies the ``diff`` to ``node1``. Use ```{performOnVNode:true, performOnDOM:true}``` to override behaviour  |
| ``vNodeDiffApply(vNode1, diff, options);`` | ``Object`` | Returns ``vNode1`` with the diff applied and applies the diff to ``vNode1``'s original parent. Use ```{performOnVNode:true, performOnDOM:true}``` to override behaviour |
| ``nodesAreEqual(node1, node2, options);`` | ``boolean`` | Returns ``true`` if ``nodes`` are equal. ``{forDebug: true, ignoreContainer: true}``  |
| ``vNodesAreEqual(vNode1, vNode2, optins);`` | ``boolean`` | Returns ``true`` if ``vNodes`` are equal. ``{forDebug: true, ignoreContainer: true}``  |
| ``vNodeToOuterVNode(vNode, options);`` | ``Object`` | Returns ``vNode`` without the children. Use ```{performOnVNode:true}``` to override the default behaviour and return a clone instead |
| ``nodeToOuterVNode(vNode);`` | ``Object`` | Returns a ``vNode`` of ``node`` without the children |
| ``nodeReplaceChildren(node1, node2);`` | ``undefined`` | Removes the children from ``node1`` and moves the children from ``node2`` into it |
| ``stringToNode(htmlString);`` | ``Node`` | Turns a string into a DOM node |
| ``nodeUpdateNode(node1, node2, options);`` | ``Object`` | Update ``node1`` from ``node2``. ``{test: true, errorOnFail: true, returnVNode: true, returnDiff: true, ignoreContainer: true}`` Returns ``vNode`` or ``DOMDiffer`` instance. Can test output and error on failure |

####Test:

[Simple jsfiddle](https://jsfiddle.net/b6Lf8n6h/7/)