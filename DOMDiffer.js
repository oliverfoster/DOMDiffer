//https://github.com/oliverfoster/DOMDiffer 2016-03-02

// Uses CommonJS, AMD or browser globals to register library
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(function() {
            return (root.DOMDiffer = factory());
        });
    } else if (typeof module === 'object' && module.exports) {
        // Node/CommonJS
        module.exports = factory();
    } else {
        // Browser globals
        this.DOMDiffer = factory();
    }
}(this, function () {

    var trim_regex = /^\s+|\s+$/g;
    var svgNS = "http://www.w3.org/2000/svg";

    var proto = {

        setOptions: function setOptions(options) {

            this.options = options || {};

            var ignoreAttributesWithPrefix = this.options.ignoreAttributesWithPrefix;
            var ignoreAttributes = this.options.ignoreAttributes;
            if ((ignoreAttributesWithPrefix === undefined || ignoreAttributesWithPrefix.length === 0)
                && (ignoreAttributes === undefined || ignoreAttributes.length === 0)) return;

            var regex = "";
            var lastIndex = ignoreAttributesWithPrefix.length-1;
            for (var i = 0, l = ignoreAttributesWithPrefix.length; i < l; i++) {
                var prefix = ignoreAttributesWithPrefix[i];
                regex+="^"+this._escapeRegExp(prefix);
                if (i !== lastIndex) {
                    regex+="|";
                }
            }

            if (regex !== "" && ignoreAttributes.length > 0) {
                regex += "|";
            }

            lastIndex = ignoreAttributes.length-1;
            for (var i = 0, l = ignoreAttributes.length; i < l; i++) {
                var attribute = ignoreAttributes[i];
                regex+=this._escapeRegExp(attribute);
                if (i !== lastIndex) {
                    regex+="|";
                }
            }

            this.options._ignoreAttributes = new RegExp(regex, "i");


        },

        _escapeRegExp: function _escapeRegExp(str) {
          return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        },

        //turn dom nodes into vnodes and diff
        nodesDiff: function nodesDiff(source, destination, options) {
            var vsource = this.nodeToVNode(source);
            var vdestination = this.nodeToVNode(destination);
            return this.vNodesDiff(vsource, vdestination, options);
        },

        //turn dom node into vnode
        nodeToVNode: function nodeToVNode(DOMNode, options, context) {

            options = options || {};

            if (context === undefined) {

                context = {
                    depth: 0,
                    index: 0,
                    uid: 0,
                    parentUid: -1
                };

            }

            //build vNode
            var vNode = this._vNodeFromNode(DOMNode, context);

            this._vNodeAttributes(DOMNode, vNode);
            this._injectSpecialAttributes(DOMNode, vNode);

            if (options.ignoreChildren !== true) {
                this._vNodeChildren(DOMNode, vNode, options, context);
            }
            
            return vNode;
        },

        _vNodeFromNode: function _vNodeFromNode(DOMNode, context) {
            //capture depth and index from parent
            var depth = context.depth;
            var index = context.index;
            
            var vNode = {
                DOMNode: DOMNode,
                nodeType: DOMNode.nodeType,
                nodeName: DOMNode.nodeName,
                attributes: {},
                id: "",
                classes: {},
                childNodes: [],
                depth: depth,
                index: index,
                deep: 0,
                uid: context.uid++,
                parentUid: context.parentUid
            };
            return vNode;
        },

        _vNodeAttributes: function _vNodeAttributes(DOMNode, vNode) {
            //build vNode attributes
            var nodeAttributes = DOMNode.attributes;
            var vNodeAttributes = vNode.attributes;
            var vNodeClasses = vNode.classes;

            for (var i = 0, attribute; attribute = nodeAttributes.item(i++);) {
                var attributeName = attribute.name;
                var attributeValue = attribute.value;

                var allowedAttribute = this._isAllowedAttribute(attributeName);
                if (allowedAttribute === false) continue;

                switch (attributeName) {
                case "class":
                    var classes = attributeValue.split(" ");
                    for (var c = 0, cl = classes.length; c < cl; c++) {
                        var className = classes[c];
                        if (className === "") continue;
                        var allowedClass = this._isAllowedClass(className);
                        if (allowedClass === false) continue;
                        vNodeClasses[className] = true;
                    }
                    continue;
                case "id":
                    vNode.id = attributeValue;
                    continue;
                }

                vNodeAttributes[attributeName] = attributeValue;
            }
        },

        _isAllowedAttribute: function _isAllowedAttribute(attribute) {

            var _ignoreAttributes = this.options._ignoreAttributes;
            if (_ignoreAttributes === undefined) return true;

            //ignore matching attribute names
            var isMatched = _ignoreAttributes.test(attribute);

            return !isMatched;

        },

        _isAllowedClass: function _isAllowedClass(className) {

            var ignoreClasses = this.options.ignoreClasses;
            if (ignoreClasses === undefined || ignoreClasses.length === 0) return true;

            //ignore matching classes
            for (var i = 0, l = ignoreClasses.length; i < l; i++) {
                var ignoreClass = ignoreClasses[i];
                if (ignoreClass === className) {
                    return false;
                }
            }

            return true;

        },

        _injectSpecialAttributes: function _injectSpecialAttributes(DOMNode, vNode) {
            var vNodeAttributes = vNode.attributes;

            switch (vNode.nodeName) {
            case "svg":
                if (vNodeAttributes["xmlns"] === undefined) vNodeAttributes["xmlns"] = svgNS;
                break;
            }
        },

        _vNodeChildren: function _vNodeChildren(DOMNode, vNode, options, context) {
            var allowedSubTree = this._isAllowedSubTree(vNode);
            if (allowedSubTree === false) return;

            //capture deep from childNodes
            var deep = 0;

            var vChildNodes = vNode.childNodes;

            if (DOMNode.childNodes.length !== 0) deep++;

            for (var i = 0, l = DOMNode.childNodes.length; i < l; i++) {
                var childNode = DOMNode.childNodes[i];
                var childNodeType = childNode.nodeType;

                switch (childNodeType) {
                case 1:
                    var childContext = {
                        depth: vNode.depth+1, 
                        index: i,
                        uid: context.uid, // carry current uid count through
                        parentUid: vNode.uid
                    };
                    var vChildNode = this.nodeToVNode(childNode, options, childContext);
                    deep = deep+vChildNode.deep;
                    context.uid = childContext.uid;
                    break;
                case 3:
                    //add text node
                    vChildNode = {
                        DOMNode: childNode,
                        nodeType: childNodeType,
                        nodeName: childNode.nodeName,
                        data: childNode.data,
                        trimmed: this._trim(childNode.data),
                        index: i,
                        depth: vNode.depth+1,
                        deep: 0,
                        uid: context.uid++,
                        parentUid: vNode.uid
                    };
                    break;
                }

                vChildNodes.push(vChildNode);
            }

            vNode.deep = deep;
        },

        _isAllowedSubTree: function _isAllowedSubTree(vNode) {
            //don't stop at root nodes
            if (vNode.parentUid === -1) return true;

            var ignoreSubTreesWithAttributes = this.options.ignoreSubTreesWithAttributes;
            if (ignoreSubTreesWithAttributes === undefined || ignoreSubTreesWithAttributes.length === 0) return true;

            //if node has attribute then stop building tree here
            for (var i = 0, l = ignoreSubTreesWithAttributes.length; i < l; i++) {
                var attr = ignoreSubTreesWithAttributes[i];
                if (vNode.attributes.hasOwnProperty(attr)) {
                    return false;
                }
            }

            return true;

        },

        //trim whitespace from a string ends
        _trim: function _trim(string) {
            return string.replace(trim_regex, '');
        },

        //flatten vnodes and diff
        vNodesDiff: function vNodesDiff(vsource, vdestination, options) {
            var fVSource = this._vNodeToFVNode(vsource);
            var fVDestination = this._vNodeToFVNode(vdestination);
            return this._fVNodesDiff(fVSource, fVDestination, options);
        },

        //flatten a vnode
        _vNodeToFVNode: function _vNodeToFVNode(vNode, rtn, index) {
            index = index || {};
            rtn = rtn || [];
            switch (vNode.nodeType) {
            case 1:
                rtn.push(vNode);
                index[vNode.uid] = vNode;
                var childNodes = vNode.childNodes;
                for (var i = 0, l = childNodes.length; i < l; i++) {
                    this._vNodeToFVNode(childNodes[i], rtn, index);
                }
                break;
            case 3:
                rtn.push(vNode);
                index[vNode.uid] = vNode;
                break;
            }
            return rtn;
        },

        //create a differential of flattened vnodes
        //1. match source nodes to the best destination node
        //2. create matches to remove all left-over source nodes with no matches
        //4. create matches to add all left-over destination nodes
        //6. find the start destination node
        //7. rebuild destination tree from source tree using added nodes where necessary and returning the order of the differences
        //8. use the differential to turn a copy of the source tree into the destination tree, removing redundant diffs on the way
        //9. return finished differential
        _fVNodesDiff: function _fVNodesDiff(fVSource, fVDestination, options) {

            options = options || {};

            //create editable arrays to preserve original arrays
            var fVSource2 = fVSource.slice(0);
            var fVDestination2 = fVDestination.slice(0);

            //try to match containers
            var sourceMatches = [];
            var uidIndexes = {
                bySourceUid: {},
                byDestinationUid: {}
            };

            this._compareAndRemoveFVNodes(fVSource2, fVDestination2, 0.20, sourceMatches, uidIndexes, options);
            var removes = this._createRemoveMatches(fVSource2, sourceMatches, uidIndexes);
            this._createAddMatches(fVDestination2, sourceMatches, uidIndexes);

            fVSource2 = undefined;
            fVDestination2 = undefined;

            var destinationStartVNode = this._fVNodeToVNode(fVDestination);
            var orderedMatches = this._rebuildDestinationFromSourceMatches(destinationStartVNode, sourceMatches, uidIndexes);

            if (options.ignoreContainer === true && orderedMatches[0] && orderedMatches[0].sourceParentUid === -1) {
                //remove container from diff
                orderedMatches.splice(0,1);
            }

            sourceMatches = undefined;

            var differential = [].concat(
                removes, //re-add removes as they get lost in the ordering
                orderedMatches
            )

            //find the start node on the original source
            var sourceStartVNode = this._fVNodeToVNode(fVSource);
        
            //remove redundant differentials by test-applying the diff
            //use performOnVNode: false so as not to change the original source vnode
            //use performOnDOM: false so as not to change the original dom structure
            this.vNodeDiffApply(sourceStartVNode, differential, {
                performOnVNode: false,
                performOnDOM: false
            });

            this._sanitizeDifferential(differential);

            return differential;
        },

        //compare each source vnode with each destination vnode
        //when a match is found, remove both the source and destination from their original flattened arrays and add a match diff object
        _compareAndRemoveFVNodes: function _compareAndRemoveFVNodes(fVSource, fVDestination, minRate, sourceMatches, uidIndexes, options) {
            if (fVSource.length === 0 || fVDestination.length === 0) return;

            //always remove root containers as matches first
            if (fVSource[0].parentUid === -1 && fVDestination[0].parentUid === -1) {
                var source = fVSource[0];
                var destination = fVDestination[0];
                var rate = this._rateCompare(source, destination);
                fVSource.splice(0, 1);
                fVDestination.splice(0, 1);
                var diffObj = {
                    source: source,
                    destination: destination,
                    nodeType: source.nodeType,
                    sourceUid: source.uid,
                    sourceParentUid: source.parentUid,
                    sourceIndex: source.index,
                    destinationUid: destination.uid,
                    destinationParentUid: destination.parentUid,
                    destinationIndex: destination.index,
                    isEqual: rate === 1,
                    rate: rate
                };
                this._expandDifferences(diffObj, options);
                sourceMatches.push(diffObj);
                uidIndexes.bySourceUid[diffObj.sourceUid] = diffObj;
                uidIndexes.byDestinationUid[diffObj.destinationUid] = diffObj;
            }

            var fIndex = fVSource.length-1;
            var f2Index = fVDestination.length-1;

            var maxRating = -1, maxRated, maxRatedIndex;

            //match each source piece to the best destination piece
            //this way the fewest source moves will be made
            var sourceTop = fVSource.length;
            for (var sIndex = 0; sIndex < sourceTop; sIndex++) {

                var source = fVSource[sIndex];
                var sourceUid = source.uid;

                var rated = [];
                for (var dIndex = 0, dLength = fVDestination.length; dIndex < dLength; dIndex++) {

                    var destination = fVDestination[dIndex];
                    var destinationUid = destination.uid;

                    var rate = this._rateCompare(destination, source);
                    if (rate > maxRating && rate >= minRate) {
                        rated.push(destination);
                        maxRated = destination;
                        maxRating = rate;
                        maxRatedIndex = dIndex;
                        if (rate === 1) {
                            fVSource.splice(sIndex, 1);
                            fVDestination.splice(dIndex, 1);
                            var diffObj = {
                                source: source,
                                destination: destination,
                                nodeType: source.nodeType,
                                sourceUid: sourceUid,
                                sourceParentUid: source.parentUid,
                                sourceIndex: source.index,
                                destinationUid: destination.uid,
                                destinationParentUid: destination.parentUid,
                                destinationIndex: destination.index,
                                isEqual: rate === 1,
                                rate: rate
                            };
                            this._expandDifferences(diffObj, options);
                            sourceMatches.push(diffObj);
                            uidIndexes.bySourceUid[diffObj.sourceUid] = diffObj;
                            uidIndexes.byDestinationUid[diffObj.destinationUid] = diffObj;
                            maxRating = 0;
                            maxRated = undefined;
                            maxRatedIndex = undefined;
                            sIndex = -1;
                            sourceTop--;
                            break;
                        }
                    }

                }

                if (maxRated && maxRating >= minRate) {
                    fVSource.splice(sIndex, 1);
                    fVDestination.splice(maxRatedIndex, 1);
                    var diffObj = {
                        source: source,
                        destination: maxRated,
                        nodeType: source.nodeType,
                        sourceUid: source.uid,
                        sourceParentUid: source.parentUid,
                        sourceIndex: source.index,
                        destinationUid: maxRated.uid,
                        destinationParentUid: maxRated.parentUid,
                        destinationIndex: maxRated.index,
                        isEqual: rate === 1,
                        rate: maxRating
                    };
                    this._expandDifferences(diffObj, options);
                    sourceMatches.push(diffObj);
                    uidIndexes.bySourceUid[diffObj.sourceUid] = diffObj;
                    uidIndexes.byDestinationUid[diffObj.destinationUid] = diffObj;
                    maxRating = 0;
                    maxRated = undefined;
                    maxRatedIndex = undefined;
                    sIndex = -1;
                    sourceTop--;
                }
            }

        }, 

        //create a percentage difference value for two vnodes
        _rateCompare: function _rateCompare(vdestination, vsource, options) {
            var value = 0;
            if (vdestination.nodeType !== vsource.nodeType) return -1;

            var rate = -1;
            switch (vdestination.nodeType) {
            case 1:
                
                value+=vsource.id===vdestination.id?3:0;
                value+=vsource.depth === vdestination.depth? 3 : 0;

                value+=this._keyValueCompare(vsource.classes, vdestination.classes) * 3;

                value+=this._keyValueCompare(vsource.attributes, vdestination.attributes) * 2;

                value+=(vsource.childNodes.length !== 0) === (vdestination.childNodes.length !== 0)? 2 : 0;
                value+=vsource.childNodes.length === vdestination.childNodes.length? 2 : 0;

                value+=vsource.nodeName === vdestination.nodeName?1:0;
                
                value+=vsource.deep === vdestination.deep? 1 : 0;
                value+=vsource.index === vdestination.index? 1 : 0;

                rate = (value / 18) || -1;

                break;
            case 3:
                value+=vsource.depth === vdestination.depth? 3 : 0;
                value+=vsource.index === vdestination.index? 1 : 0;

                value+=vsource.trimmed === vdestination.trimmed? 2 : 0;
                value+=vsource.data === vdestination.data? 1 : 0;
                
                rate = (value / 7) || -1;
            }

            return rate;
        },

        //create a percentage difference value for two vnodes
        _rateCompareNoChildren: function _rateCompareNoChildren(vdestination, vsource) {
            var value = 0;
            if (vdestination.nodeType !== vsource.nodeType) return -1;

            var rate = -1;
            switch (vdestination.nodeType) {
            case 1:
                
                value+=vsource.id===vdestination.id?3:0;

                value+=this._keyValueCompare(vsource.classes, vdestination.classes) * 3;

                value+=this._keyValueCompare(vsource.attributes, vdestination.attributes) * 2;

                value+=vsource.nodeName === vdestination.nodeName?1:0;

                rate = (value / 9) || -1;

                break;
            case 3:
 
                value+=vsource.trimmed === vdestination.trimmed? 2 : 0;
                value+=vsource.data === vdestination.data? 1 : 0;
                
                rate = (value / 3) || -1;
            }

            return rate;
        },

        _rateCompareNoDepth: function _rateCompareNoDepth(vdestination, vsource) {
            var value = 0;
            if (vdestination.nodeType !== vsource.nodeType) return -1;

            var rate = -1;
            switch (vdestination.nodeType) {
            case 1:
                
                value+=vsource.id===vdestination.id?3:0;

                value+=this._keyValueCompare(vsource.classes, vdestination.classes) * 3;

                value+=this._keyValueCompare(vsource.attributes, vdestination.attributes) * 2;

                value+=vsource.nodeName === vdestination.nodeName?1:0;
                
                value+=vsource.index === vdestination.index? 1 : 0;

                rate = (value / 10) || -1;

                break;
            case 3:
                value+=vsource.index === vdestination.index? 1 : 0;

                value+=vsource.trimmed === vdestination.trimmed? 2 : 0;
                value+=vsource.data === vdestination.data? 1 : 0;
                
                rate = (value / 4) || -1;
            }

            return rate;
        },

        //compare two key value pair objects
        //return percentage match 0-1
        _keyValueCompare: function _keyValueCompare(object1, object2) {
            var matchingValues = 0;
            var totalKeys = 0;
            for (var k1 in object1) {
                totalKeys++;
                if (object2.hasOwnProperty(k1)) {
                    if (object2[k1] === object2[k1]) {
                        matchingValues++;
                    }
                }
            }
            for (var k2 in object2) {
                if (object1.hasOwnProperty(k2) === false) {
                    totalKeys++;
                }
            }
            if (totalKeys === 0) return 1;
            return (matchingValues / totalKeys) || -1;
        },

        //manufacture 'matches' for the items to remove from the source tree
        _createRemoveMatches: function _createRemoveMatches(fVSource2, sourceMatches, uidIndexes) {
            if (fVSource2.length === 0) return [];

            var removes = [];

            var deleteSourceRoots = [];
            var sourceParentUids = {};

            for (var f2Index = 0, l = fVSource2.length; f2Index < l; f2Index++) {
                var source = fVSource2[f2Index];

                var diffObj = {
                    changeRemove: true,
                    source: source,
                    nodeType: source.nodeType,
                    sourceUid: source.uid,
                    sourceParentUid: source.parentUid,
                };
                sourceMatches.push(diffObj);
                uidIndexes.bySourceUid[diffObj.sourceUid] = diffObj;
                uidIndexes.byDestinationUid[diffObj.destinationUid] = diffObj;

                sourceParentUids[source.uid] = true;
                if (sourceParentUids[source.parentUid] === undefined) {
                    deleteSourceRoots.push(source);
                    //only add source root deletion to output diff
                    removes.push(diffObj);
                }

            }

            fVSource2.splice(0, fVSource2.length)[0];

            return removes;
        
        },

        //manufacture 'matches' for the items to add to the source tree from the destination
        _createAddMatches: function _createAddMatches(fVDestination2, sourceMatches, uidIndexes) {
            if (fVDestination2.length === 0) return [];
            //create new source pieces to add by cloning the needed destination pieces

            var newDestinationRoots = [];
            var destinationParentUids = {};
            for (var f2Index = 0, l = fVDestination2.length; f2Index < l; f2Index++) {

                var destination = fVDestination2[f2Index];
                destinationParentUids[destination.uid] = true;
                if (destinationParentUids[destination.parentUid] === undefined) {
                    newDestinationRoots.push(destination);
                }

            }
            fVDestination2.splice(0, fVDestination2.length)[0];

            //create matches for new objects to that sourceUids don't conflict with preexisting sourceNodes
            //assign new item.sourceUids from the negative spectrum
            var newSourceUids = -1;
            var translateOldDestionationUidToNewSourceUid = {};
            for (var i = 0, l = newDestinationRoots.length; i < l; i++) {

                var fVSource = this._vNodeToFVNode(this._cloneObject(newDestinationRoots[i], {"DOMNode": true})); //clone for new source nodes
                var fVDestination = this._vNodeToFVNode(newDestinationRoots[i]);

                for (var c = 0, cl = fVDestination.length; c < cl; c++) {

                    var destination = fVDestination[c];
                    var oldDestinationParentUid = destination.parentUid;
                    var oldDestionationUid = destination.uid;

                    var newSourceParentUid = translateOldDestionationUidToNewSourceUid[oldDestinationParentUid];
                    
                    //check if there is an indexed matching destination
                    var existingDiff = uidIndexes.byDestinationUid[destination.uid];
                    if (existingDiff) {
                        //no need to create new nodes as nodes will be moved from existing source
                        translateOldDestionationUidToNewSourceUid[oldDestionationUid] = existingDiff.sourceUid;
                        continue;
                    }

                    var source = this.vNodeToOuterVNode(fVSource[c], {performOnVNode: true});
                    var newSourceUid = newSourceUids--;
                    translateOldDestionationUidToNewSourceUid[oldDestionationUid] = newSourceUid;
                    
                    //if we're dealing with a child of a new root
                    if (newSourceParentUid === undefined) {
                        //if no translation to a new uid, not a child of a new root
                        //assume new node is connected to a preexisting source node
                        newSourceParentUid = uidIndexes.byDestinationUid[oldDestinationParentUid].sourceUid;
                    }

                    //configure new source nodes
                    source.uid = newSourceUid;
                    source.parentUid = newSourceParentUid;
                    source.DOMNode = undefined;

                    var vNode = {};
                    switch (source.nodeType) {
                    case 1:
                        vNode.attributes = source.attributes;
                        vNode.classes = source.classes;
                        vNode.id = source.id;
                        vNode.nodeName = source.nodeName;
                        vNode.nodeType = source.nodeType;
                        vNode.childNodes = [];
                        break;
                    case 3:
                        vNode.data = source.data;
                        vNode.nodeType = source.nodeType;
                        vNode.nodeName = source.nodeName;
                        vNode.trimmed = source.trimmed;
                    }
                    vNode.uid = newSourceUid;
                    vNode.parentUid = newSourceParentUid;
                    vNode.deep = source.deep;
                    vNode.depth = source.depth;
                    vNode.index = source.index;

                    var diffObj = {
                        changeAdd: true,
                        changeHierachyData: true,
                        destination: destination,
                        nodeType: destination.nodeType,
                        destinationUid: oldDestionationUid,
                        destinationParentUid: oldDestinationParentUid,
                        depth: destination.depth,
                        deep: destination.deep,
                        source: source,
                        vNode: vNode,
                        sourceUid: newSourceUid,
                        sourceParentUid: newSourceParentUid,
                        sourceIndex: source.index,
                        destinationIndex: destination.index
                    }
                    sourceMatches.push(diffObj);
                    uidIndexes.bySourceUid[newSourceUid] = diffObj;
                    uidIndexes.byDestinationUid[oldDestionationUid] = diffObj;
                }
            }

        },

        //add attributes to the match to express the differences between each pair
        //this makes each match-pair into a match-diff
        //strip DOMNodes
        _expandDifferences: function _expandDifferences(match, options) {

            if (match.changeRemove || match.changeAdd) return;

            var source = match.source;
            var destination = match.destination;

            if (source.parentUid === -1 && (options.ignoreContainer || this.options.ignoreContainer) ) return;

            if (source.deep !== destination.deep
                || source.depth !== destination.depth) {
                    match.changeHierachyData = true;
                    match.depth = destination.depth;
                    match.deep = destination.deep;
                    match.isEqual = false;
            }

            switch(match.nodeType) {
            case 1:
                if (source.nodeName !== destination.nodeName) {
                    match.changeNodeName = true;
                    match.nodeName = destination.nodeName;
                    match.isEqual = false;
                }
                var changeAttributes = this._diffKeys(source.attributes, destination.attributes);
                if (changeAttributes.isEqual === false) {
                    match.changeAttributes = true;
                    match.attributes = changeAttributes;
                    match.isEqual = false;
                }
                var changeClasses = this._diffKeys(source.classes, destination.classes);
                if (changeClasses.isEqual === false) {
                    match.changeClasses = true;
                    match.classes = changeClasses;
                    match.isEqual = false;
                }
                if (source.id !== destination.id) {
                    match.changeId = true;
                    match.id = destination.id;
                    match.isEqual = false;
                }

                break;
            case 3:

                if (source.data !== destination.data) {
                    match.changeData = true;
                    match.data = destination.data;
                    match.isEqual = false;
                }

                break;
            }

        },

        //describe the differences between two objects (source & destination attributes, or source & destination classes)
        _diffKeys: function _diffKeys (source, destination) {
            var diff = {
                removed: [],
                addedLength: 0,
                added: {},
                changedLength: 0,
                changed: {},
                isEqual: true,
            };
            for (var k in source) {
                var exists = destination.hasOwnProperty(k);
                if (exists === false) {
                    diff.removed.push(k);
                    continue;
                } 

                var value = source[k];
                var nodeValue = destination[k];
                if (value !== nodeValue) {
                    diff.changed[k] = nodeValue;
                    diff.changedLength++;
                }
            }
            for (var k in destination) {
                var exists = source.hasOwnProperty(k);
                if (exists === false) {
                    var nodeValue = destination[k];
                    diff.added[k] = nodeValue;
                    diff.addedLength++;
                }
            }
            if (diff.removed.length > 0 || diff.addedLength > 0 || diff.changedLength > 0) {
                diff.isEqual = false;
            }
            return diff;
        },

        //find the first vnode in a flattened vnode list
        _fVNodeToVNode: function _fVNodeToVNode(fVNode) {
            var startVNode;
            for (var i = 0, vNode; vNode = fVNode[i++];) {
                if (vNode.parentUid === -1) {
                    startVNode = vNode;
                    break;
                }
            }
            if (startVNode === undefined) throw "cannot find start node";
            return startVNode;
        },

        //recursively go through the destination tree, checking each source mapped node (or added node) and outputing the match-diffs where necessary
        //this filters and orders the match-diffs creating a preliminary differential
        _rebuildDestinationFromSourceMatches: function _rebuildDestinationFromSourceMatches(destinationStartVNode, sourceMatches, uidIndexes, destinationParentVNode, newIndex) {

            var diffs = [];
            var diff = uidIndexes.byDestinationUid[destinationStartVNode.uid];

            var isNotRootNode = (diff.sourceParentUid !== -1);

            if (isNotRootNode) {
                var sourceParentDiff = uidIndexes.bySourceUid[diff.sourceParentUid];
                var destinationParentDiff =  uidIndexes.byDestinationUid[destinationParentVNode.uid];
                
                //if source parent destination match, is not the same as the expected destination then move
                if (sourceParentDiff.destinationUid !== destinationParentVNode.uid) {

                    var moveToSourceUid = destinationParentDiff.sourceUid;
                    //mark to move into a different parent
                    diff.isEqual = false;
                    diff.changeParent = true;

                    //fetch source parent to relocate node to
                    diff.newSourceParentUid = moveToSourceUid;

                }

                var isChildNode = (newIndex !== undefined);
                var sourceDiff = uidIndexes.bySourceUid[diff.sourceUid];

                //if is a child node and has moved the add directive to reindex in siblings
                if (isChildNode && 
                    (diff.changeAdd === true 
                        || diff.changeParent === true 
                        || destinationStartVNode.index !== newIndex
                        || sourceDiff.sourceIndex !== newIndex 
                        || sourceParentDiff.changeChildren === true
                )) {
                    diff.isEqual = false;
                    diff.changeIndex = true;
                    destinationParentDiff.changeChildren = true;
                    destinationParentDiff.isEqual = false;
                }

            } else if (diff.changeAdd == true) {
                diff.isEqual = false;
                diff.changeIndex = true;
            }


            switch (diff.nodeType) {
            case 1:
                if (diff.isEqual === false
                    || diff.changeAdd === true
                    || diff.changeId === true
                    || diff.changeNodeName === true
                    || diff.changeAttributes === true
                    || diff.changeClasses === true
                    || diff.changeParent === true
                    || diff.changeIndex === true
                    || diff.changeHierachyData === true
                    || diff.changeChildren === true
                    ) {
                    diff.isIncluded = true;
                    diffs.push(diff);
                }
                var haveChildrenChanged = diff.changeChildren;

                for (var i = 0, l = destinationStartVNode.childNodes.length; i < l; i++) {
                    var childNode = destinationStartVNode.childNodes[i];
                    var childDiffs = this._rebuildDestinationFromSourceMatches(childNode, sourceMatches, uidIndexes, destinationStartVNode, i);
                    diffs = diffs.concat(childDiffs);
                }

                if (haveChildrenChanged === undefined && diff.changeChildren === true) {
                    diff.retrospectiveChildrenAdd = true;
                    if (diff.isIncluded === undefined) {
                        diff.isIncluded = true;
                        diffs.push(diff);
                    }
                    for (var i = 0, l = destinationStartVNode.childNodes.length; i < l; i++) {
                        var childNode = destinationStartVNode.childNodes[i];
                        var childDiff = uidIndexes.byDestinationUid[childNode.uid];
                        if (childDiff.isIncluded === undefined) {
                            childDiff.isIncluded = true;
                            childDiff.retrospectiveChildrenAdd2 = true;
                            diffs = diffs.concat(childDiff);
                        }
                    }
                }

                break;
            case 3:
                if (diff.isEqual === false
                    || diff.changeData === true
                    || diff.changeAdd === true
                    || diff.changeParent === true
                    || diff.changeIndex === true
                    || diff.changeHierachyData === true
                    ) {
                    diff.isIncluded = true;
                    diffs.push(diff);
                }
                break;
            }

            return diffs;

        },

        _sanitizeDifferential: function _sanitizeDifferential(differential) {
            for (var i = 0, diff; diff = differential[i++];) {
                delete diff.isIncluded;
                delete diff.source;
                delete diff.destination;
                delete diff.isEqual;
                delete diff.rate;
            }
            return differential;
        },

        //apply the differential to the vnode, optionally cloning the vnode so as not to change it
        vNodeDiffApply: function vNodeDiffApply(startVNode, differential, options) {

            options = options || {
                performOnVNode: true,
                performOnDOM: true
            };

            if (options.performOnVNode !== true) startVNode = this._cloneObject(startVNode, {"DOMNode":true});

            var bySourceUid = {};
            var fVStartNode = [];
            this._vNodeToFVNode(startVNode, fVStartNode, bySourceUid);

            var differential2 = this._cloneObject(differential, {"DOMNode":true});

            var diffIndexBySourceUid = {};
            for (var i = 0, diff; diff = differential2[i++];) { 
                diffIndexBySourceUid[diff.sourceUid] = diff;
            }

            for (var i = 0, diff; diff = differential2[i++];) {
                var vNode = bySourceUid[diff.sourceUid];

                if (diff.changeRemove === true) {
                    this._changeRemove(diff, vNode, bySourceUid, diffIndexBySourceUid, options);                    
                    diff.isComplete = true;
                    continue;
                }

                if (diff.changeAdd === true) {
                    vNode = this._changeAdd(diff, vNode, bySourceUid, diffIndexBySourceUid, options);
                }
                
                if (diff.changeHierachyData === true) {
                    this._changeHierachyData(diff, vNode);
                }

                //change attributes
                if (diff.changeAttributes === true) {
                    this._changeAttributes(diff, vNode, options);
                }

                if (diff.changeId === true) {
                    this._changeId(diff, vNode, options);
                }

                //change classes
                if (diff.changeClasses === true) {
                    this._changeClasses(diff, vNode, options);                    
                }

                //change nodeName
                if (diff.changeNodeName === true) {
                    this._changeNodeName(diff, vNode, bySourceUid, options);                    
                }

                if (diff.changeParent === true) {
                    this._changeParent(diff, vNode, bySourceUid, diffIndexBySourceUid, options);
                }

                if (diff.changeIndex === true) {
                    this._changeIndex(diff, vNode, bySourceUid, diffIndexBySourceUid, options);
                }

                //change data
                if (diff.changeData === true) {
                    this._changeData(diff, vNode, options);                    
                }

                if (diff.changeChildren === true) {
                    this._reindexParentVNode(vNode, diffIndexBySourceUid, options);
                }

                diff.isComplete = true;
            }

            //remove redundant items from the original diff
            this._removeRedundants(differential, differential2);

            return startVNode;
        },

        _changeRemove: function _changeRemove(diff, vNode, bySourceUid, diffIndexBySourceUid, options) {
            var parentVNode = bySourceUid[diff.sourceParentUid];
            if (parentVNode.nodeType === 3) throw "cannot find children of a text node";

            var found = false;
            for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
                if ( parentVNode.childNodes[r].uid === diff.sourceUid) {

                    if (options.performOnDOM === true) {
                        parentVNode.DOMNode.removeChild(vNode.DOMNode);
                    }

                    parentVNode.childNodes.splice(r,1);
                    found = true;
                    break;
                }
            }
            if (found === false) throw "Remove not found";
        },

        _changeAdd: function _changeAdd(diff, vNode, bySourceUid, diffIndexBySourceUid, options) {
            var parentVNode = bySourceUid[diff.sourceParentUid];
                    
            var newSourceVNode = this._cloneObject(diff.vNode, {"DOMNode":true});
            var newNode = this.vNodeToNode(newSourceVNode);
            newSourceVNode.DOMNode = newNode;

            //index the new diff by source id so that subsequent child adds have somewhere to go
            bySourceUid[diff.sourceUid] = newSourceVNode;

            //add to the end
            if (options.performOnDOM === true) {
                parentVNode.DOMNode.appendChild(newNode);
            }

            parentVNode.childNodes.push(newSourceVNode);

            return newSourceVNode;
        },

        _changeAttributes: function _changeAttributes(diff, vNode, options) {
            var attributes = diff.attributes;
            if (attributes.removed.length > 0) {
                for (var r = 0, rl = attributes.removed.length; r < rl; r++) {
                    var key = attributes.removed[r];

                    if (options.performOnDOM === true) {
                        vNode.DOMNode.removeAttribute(key);
                    }

                    delete vNode.attributes[key];
                }
            }
            if (attributes.changedLength > 0) {
                for (var k in attributes.changed) {

                    if (options.performOnDOM === true) {
                        vNode.DOMNode.setAttribute(k, attributes.changed[k]);
                    }

                    vNode.attributes[k] = attributes.changed[k];
                }
            }
            if (attributes.addedLength > 0) {
                for (var k in attributes.added) {

                    if (options.performOnDOM === true) {
                        vNode.DOMNode.setAttribute(k, attributes.added[k]);
                    }

                    vNode.attributes[k] = attributes.added[k];
                }
            }
        },

        _changeId: function _changeId(diff, vNode, options) {
            if (options.performOnDOM === true) {
                if (diff.id === "") {
                    vNode.DOMNode.removeAttribute('id');
                } else {
                    vNode.DOMNode.setAttribute('id', diff.id);
                }
            }
            vNode.id = diff.id;
        },

        _changeClasses: function _changeClasses(diff, vNode, options) {
            var classes = diff.classes;
            if (classes.removed.length > 0) {
                for (var r = 0, rl = classes.removed.length; r < rl; r++) {
                    var key = classes.removed[r];
                    delete vNode.classes[key];
                }
            }
            if (classes.changedLength > 0) {
                for (var k in classes.changed) {
                    vNode.classes[k] = classes.changed[k];
                }
            }
            if (classes.addedLength > 0) {
                for (var k in classes.added) {
                    vNode.classes[k] = classes.added[k];
                }
            }

            if (options.performOnDOM === true) {
                if (classes.isEqual === false) {
                    var classNames = [];
                    for (var k in vNode.classes) {
                        classNames.push(k);
                    }
                    var finalClass = classNames.join(" ");
                    if (finalClass === "") {
                        vNode.DOMNode.removeAttribute("class");
                    } else {
                        vNode.DOMNode.setAttribute("class", finalClass);
                    }
                }
            }
        },

        _changeNodeName: function _changeNodeName(diff, vNode, bySourceUid, options) {
            if (options.performOnDOM === true) {
                //create a new node, add the attributes
                var parentNode = bySourceUid[diff.sourceParentUid].DOMNode;

                var vNodeOuter = this.vNodeToOuterVNode(vNode, {performOnVNode: false});
                vNodeOuter.nodeName = diff.nodeName;

                var newNode = this.vNodeToNode(vNodeOuter);

                //move all the children from old node to new node
                this.nodeReplaceChildren(newNode, vNode.DOMNode);

                //replace diff node and dom node so that subsequent children have the right location
                parentNode.replaceChild(newNode, vNode.DOMNode);

                vNode.DOMNode = newNode;
            }

            vNode.nodeName = diff.nodeName;
        },

        _changeParent: function _changeParent(diff, vNode, bySourceUid, diffIndexBySourceUid, options) {
            var oldParentVNode = bySourceUid[diff.sourceParentUid];
            var newParentVNode = bySourceUid[diff.newSourceParentUid];

            //remove from original source childNodes
            var found = false;
            var moveNode;
            for (var r = 0, rl = oldParentVNode.childNodes.length; r < rl; r++) {
                if ( oldParentVNode.childNodes[r].uid === diff.sourceUid) {

                    if (options.performOnDOM === true) {
                        moveNode = oldParentVNode.DOMNode.childNodes[r];
                    }

                    oldParentVNode.childNodes.splice(r, 1);
                    found = true;
                    break;
                }
            }
            if (found === false) {
                throw "cannot find object to move in parent";
            }

            //add to the end
            if (options.performOnDOM === true) {
                newParentVNode.DOMNode.appendChild(moveNode);
            }

            newParentVNode.childNodes.push(vNode);
        },

        _changeIndex: function _changeIndex(diff, vNode, bySourceUid, diffIndexBySourceUid, options) {
            var parentVNode;
            if (diff.changeParent) {
                //if node changed parents last
                parentVNode = bySourceUid[diff.newSourceParentUid];

                //reindex vnodes as they can change around
                var oldParentVNode = bySourceUid[diff.sourceParentUid];
                for (var r = 0, rl = oldParentVNode.childNodes.length; r < rl; r++) {
                    oldParentVNode.childNodes[r].index = r;
                }

            } else {
                parentVNode = bySourceUid[diff.sourceParentUid];
            }
            
            //reindex vnodes as they can change around
            for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
                parentVNode.childNodes[r].index = r;
            }

            var parentDiff = diffIndexBySourceUid[parentVNode.uid];
            

            if (diff.destinationIndex === vNode.index) {
                if (diff.changeAttributes === undefined
                    && diff.changeClass === undefined
                    && diff.changeNodeName === undefined
                    && diff.changeData === undefined
                    && diff.changeParent === undefined
                    && diff.changeAdd === undefined 
                    && diff.changeRemove === undefined
                    && diff.changeHierachyData === undefined
                    && parentDiff.changeChildren === undefined) {
                        //remove diff if only changing index
                        diff.redundant = true;
                }
            } else {

                this._relocateNode(diff, vNode, parentVNode, options);

            }

        },

        _relocateNode: function(diff, vNode, parentVNode, options) {
            if (diff.destinationIndex > vNode.index) {
                /* insert before next, when a node is moved up a list it changes the indices of 
                    *  all the elements above it
                    *  it's easier to pick the node after its new position and insert before that one
                    *  makes indices come out correctly
                    */
                if (options.performOnDOM === true) {
                    var moveNode = parentVNode.DOMNode.childNodes[vNode.index];

                    var offsetIndex = diff.destinationIndex+1;
                    if (offsetIndex >= parentVNode.DOMNode.childNodes.length) {
                        parentVNode.DOMNode.appendChild(moveNode);
                    } else {
                        var afterNode = parentVNode.DOMNode.childNodes[offsetIndex];
                        parentVNode.DOMNode.insertBefore(moveNode, afterNode);
                    }
                }
            } else {
                if (options.performOnDOM === true) {
                    var afterNode = parentVNode.DOMNode.childNodes[diff.destinationIndex];
                    var moveNode = parentVNode.DOMNode.childNodes[vNode.index];
                    parentVNode.DOMNode.insertBefore(moveNode, afterNode);
                }
            }

            parentVNode.childNodes.splice(vNode.index,1);
            parentVNode.childNodes.splice(diff.destinationIndex,0,vNode);
            vNode.index = diff.destinationIndex;
        },

        _reindexParentVNode: function(parentVNode, diffIndexBySourceUid, options, notest) {
             /* MILD LOGIC ERROR: 
                *  At this point a node can be a lot further forward than it should
                *  This code is to correct for when new nodes are added in a position after 
                *  a node that will be later removed. When the subsequent node is removed
                *  all of the earlier add
                */

            var reIndexOnly = false;
            for (var r = 0, rl = parentVNode.childNodes.length; r < rl; r++) {
                var childNode = parentVNode.childNodes[r];
                //reindex vnodes as they can change around
                childNode.index = r;

                if (reIndexOnly) continue;

                var childDiff = diffIndexBySourceUid[childNode.uid];

                //check if a differential was made for this node
                //if there was it was a node that moved or changed
                if (childDiff === undefined) continue;

                if (childDiff.changeRemove === true) {
                    reIndexOnly = true;
                    continue;
                }

                //compare the destinationIndex with the current index
                if (childDiff.destinationIndex === childNode.index) continue;

                if (childDiff.changeParent === true && childDiff.newSourceParentUid !== childNode.parentUid) {
                    reIndexOnly = true;
                    continue;
                }

                if (childDiff.destinationIndex >= parentVNode.childNodes.length) continue;

                this._relocateNode(childDiff, childNode, parentVNode, options);
                //start again from affected nodes
                r = childDiff.destinationIndex-2;
            }

            //TO TEST THE ABOVE CODE WAS SUCCESSFULL
            /*if (options.test && options.performOnDOM && notest !== true) {
                var reVNode = this.nodeToVNode(parentVNode.DOMNode);
                var res = this.vNodesAreEqual(parentVNode, reVNode, {ignoreDepths: false, forDebug:true});
                if (!res) debugger;
            }

            if (reIndexOnly) {
                //console.log("reindexed", diffIndexBySourceUid[parentVNode.uid]);
            }*/
        },

        _changeData: function _changeData(diff, vNode, options) {
            if (options.performOnDOM === true) {
                vNode.DOMNode.data = diff.data;
            }

            vNode.data = diff.data;
            vNode.trimmed = this._trim(diff.data);
        },

        _changeHierachyData: function _changeHierachyData(diff, vNode) {
            vNode.depth = diff.depth;
            vNode.deep = diff.deep;
        },

        _removeRedundants: function _removeRedundants(differential, differential2) {
            for (var i = differential2.length-1, l = -1; i > l; i--) {
                var diff = differential2[i];
                if (diff.redundant) {
                    differential.splice(i,1);
                }
            }
        },

        //clone basic javascript Array, Object and primative structures
        _cloneObject: function _cloneObject(value, copy) {
            if (value instanceof Array) {
                var rtn = [];
                for (var i = 0, l = value.length; i < l; i++) {
                    rtn[i] = this._cloneObject(value[i], copy);
                }
                return rtn;
            } else if (value instanceof Object) {
                var rtn = {};
                for (var k in value) {
                    if (copy && copy[k]) {
                        rtn[k] = value[k]
                    } else {
                        rtn[k] = this._cloneObject(value[k], copy);
                    }
                }
                return rtn;
            }
            return value;
        },

        //clone and strip the children from the vNode
        vNodeToOuterVNode: function vNodeToOuterVNode(vNode, options) {
            if (options !== undefined && options.performOnVNode === false) {
                vNode = this._cloneObject(vNode, { "DOMNode": true });
            }
            switch (vNode.nodeType) {
            case 1:
                vNode.childNodes.length = 0;
            }
            return vNode;
        },

        //turn dom node into vnode ignoring children
        nodeToOuterVNode: function nodeToOuterVNode(DOMNode, options) {
            options = this._cloneObject(options) || {};
            options.ignoreChildren = true;
            return this.nodeToVNode(DOMNode, options);
        },

        //render a node into a dom node
        vNodeToNode: function vNodeToNode(vNode) {

            var DOMNode;
            switch (vNode.nodeType) {
            case 1:
                switch (vNode.nodeName) {
                case "svg":
                    DOMNode = document.createElementNS(svgNS, vNode.nodeName);
                    break;
                default:
                    DOMNode = document.createElement(vNode.nodeName);
                }
                for (var k in vNode.attributes) {
                    DOMNode.setAttribute(k, vNode.attributes[k]);
                }
                var classes = [];
                for (var k in vNode.classes) {
                    classes.push(k);            
                }
                var className = classes.join(" ");
                if (className) {
                    DOMNode.setAttribute("class", className);
                }
                if (vNode.id) {
                    DOMNode.setAttribute("id", vNode.id);
                }

                for (var i = 0, childNode; childNode = vNode.childNodes[i++];) {
                    DOMNode.appendChild( this.vNodeToNode(childNode) );
                }
                break;
            case 3:
                DOMNode = document.createTextNode(vNode.data);
                break;
            }

            return DOMNode;
        },

        nodeDiffApply: function nodeDiffApply(DOMNode, differential, options) {
            var startVNode = this.nodeToVNode(DOMNode);

            options = options || {
                performOnVNode: true,
                performOnDOM: true
            };

            this.vNodeDiffApply(startVNode, differential, options);

            return startVNode;
        },

        //replace the children of one node with the children of another
        nodeReplaceChildren: function nodeReplaceChildren(DOMNode, withNode) {
            DOMNode.innerHTML = "";
            for (var n = 0, nl = withNode.childNodes.length; n < nl; n++) {
                DOMNode.appendChild(withNode.childNodes[0]);
            } 
        },

        nodesAreEqual: function nodesAreEqual(node1, node2, options) {

            var vNode1 = this.nodeToVNode(node1);
            var vNode2 = this.nodeToVNode(node2);

            return this.vNodesAreEqual(vNode1, vNode2, options);

        },

        vNodesAreEqual: function vNodesAreEqual(vNode1, vNode2, options) {

            options = options || {};

            var rate;
            if (vNode1.parentUid === -1 && (options.ignoreContainer || this.options.ignoreContainer)) {
                rate = 1;
            } else {
                if (options.ignoreDepths === true) {
                    rate = this._rateCompareNoDepth(vNode1, vNode2);
                    var ncrate = this._rateCompareNoChildren(vNode1, vNode2);
                    if (rate !== 1 && ncrate !== 1) {
                        if (options.forDebug === true) {
                            console.error("nodes different at", vNode1, vNode2);
                            //debugger;
                        };
                        return false;
                    }
                } else {
                    rate = this._rateCompare(vNode1, vNode2);
                    var ncrate = this._rateCompareNoChildren(vNode1, vNode2);
                    if (rate !== 1 && ncrate !== 1) {
                        if (options.forDebug === true) {
                            console.error("nodes different at", vNode1, vNode2);
                            //debugger;
                        };
                        return false;
                    }
                }
            }

            switch (vNode1.nodeType) {
            case 1:
                if (vNode1.childNodes.length !== vNode2.childNodes.length) {
                    if (options.forDebug === true) {
                        console.error("childNodes different at", vNode1, vNode2);
                        //debugger;
                    };
                    return false;
                }
                for (var i = 0, l = vNode1.childNodes.length; i < l; i++) {
                    if (this.vNodesAreEqual(vNode1.childNodes[i], vNode2.childNodes[i], options) === false) {
                        return false;
                    }
                }
                break;
            }

            return true;

        },

        vNodeCheckIndexes: function(vNode) {

            switch (vNode.nodeType) {
            case 1:

                for (var i = 0, l = vNode.childNodes.length; i < l; i++) {
                    var childNode = vNode.childNodes[i];
                    if (childNode.index !== i) {
                        console.error("indexes different at", vNode1);
                        //debugger;
                    }
                    this.vNodeCheckIndexes(childNode);
                }
            }

        },

        nodeUpdateNode: function nodeUpdateNode(DOMNode1, DOMNode2, options) {
            options = options || {};

            var vNode1 = this.nodeToVNode(DOMNode1);
            var vNode2 = this.nodeToVNode(DOMNode2);

            if (options.test) {
                this.vNodeCheckIndexes(vNode1);
                this.vNodeCheckIndexes(vNode2);
            }

            var diff = this.vNodesDiff(vNode1, vNode2, options);

            this.vNodeDiffApply(vNode1, diff);

            if (options.test === true) {

                this.vNodeCheckIndexes(vNode1);
                this.vNodeCheckIndexes(vNode2);

                var vNode1Reread = this.nodeToVNode(DOMNode1);
                this.vNodeCheckIndexes(vNode1Reread);

                var updatedVSRereadUpdated = this.vNodesAreEqual(vNode1, vNode1Reread, options);
                var updatedVSOriginal = this.vNodesAreEqual(vNode1, vNode2, options);
                var rereadUpdatedVSOriginal = this.vNodesAreEqual(vNode1Reread, vNode2, options);

                if (updatedVSRereadUpdated === false
                    || updatedVSOriginal === false 
                    || rereadUpdatedVSOriginal === false) {
                    if (options.errorOnFail === true) {
                        throw "failed update";
                    } else {
                        console.error("failed update");
                        //debugger;
                    }
                }
            }

            if (options.returnVNode === true) {
                return vNode1;
            } else if (options.returnDiff === true) {
                return diff;
            } else {
                return this;
            }

        },

        stringToNode: function stringToNode(htmlString) {

            var container = document.createElement("div");
            container.innerHTML = htmlString;
            return container.childNodes[0];

        }

    };

    
    function DOMDiffer(options) {
        options = options || {
            ignoreContainer: false,
            ignoreAttributes: [],
            ignoreAttributesWithPrefix: [
                "sizzle",
                "jquery"
            ],
            ignoreSubTreesWithAttributes: [
                "view-container"
            ]
        };
        this.setOptions(options);
    }
    for (var k in proto) DOMDiffer.prototype[k] = proto[k];


    //export DOMDiffer for use in document
    return DOMDiffer;

}));