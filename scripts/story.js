// Helper functions

// Check if a value is undefined
const isUndefined = v => typeof v === "undefined";

// Turn HTML string to DOM object
const parseHTML = function(str) {
	var tmpDoc = document.implementation.createHTMLDocument();
	tmpDoc.body.innerHTML = str;
	return tmpDoc.body.children;
};

// Make HTMLCollections forEach-able
HTMLCollection.prototype.forEach = function(callback, thisArg) {
	if (isUndefined(thisArg)) thisArg = this;
	for (var i = 0; i < this.length; i++) {
		callback.call(thisArg, this[i], i, this);
	}
};

// Classes (ooh, fancy!)

// Class for playing the story
class StoryPlayer {
	
	// Start the story, and instantiate everything
	static start() {
		console.log("Starting story.js...");
		this.loadJson(this.getJsonPath());
		UI.init();
	}
	
	// Get the story json's path
	static getJsonPath() {
		var storyEl = document.getElementsByTagName("jw-story")[0];
		var storyJsonPath = storyEl.getAttribute("src");
		if (!storyJsonPath) storyJsonPath = "./story";
		return storyJsonPath + "/story.json";
	}
	
	// Load the story json
	static loadJson(pathToJson) {
		console.log("Loading story.json...");
		var r = new XMLHttpRequest();
		r.open("GET", pathToJson, true);
		r.onload = function() {
			if (this.status >= 200 && this.status < 400)
			{
				// Set the active story to the loaded JSON
				storyData.story = JSON.parse(this.responseText);
				StoryPlayer.initStory();
			}
		};
		r.send();
		console.log("story.js loaded!");
	}
	
	// Initialize the story
	static initStory() {
		this.prepareData(storyData.story);
		// Always start with the first defined scene
		storyData.story.scene = storyData.story.scenes[0];
		// DEBUG: print the story's name (not sure where to use this yet)
		console.log(
			`%c${storyData.story.name}`,
			consoleStyles.title
		);
		SceneHandler.setupScene(storyData.story.scene);
	}
	
	// Prepare any uninitialized data for the story
	static prepareData(json) {
		// We have not visited any scene
		for (var i = 0; i < json.scenes.length; i++) {
			json.scenes[i].visited = false;
		}
		// We own none of the items we started out with
		json.items.forEach(function(item) {
			if (!item.hasOwnProperty("owned")) item.owned = false;
		});
		// Complete necessary, yet undefined, scene data
		json.scenes.forEach(function(scene, i, sceneArr) {
			// Put scene text in array if not in one
			if (!Array.isArray(scene.text)) scene.text = [scene.text];
			
			// Add ending text if this scene is an ending
			if (scene.hasOwnProperty("isEnding") && scene.isEnding) scene.text.push("THE END");
			
			// If we can pick up and drop items here...
			if (scene.hasOwnProperty("canEquipItems") && scene.canEquipItems)
			{
				json.items.forEach(function(item) {
					if (!item.hidden && item.equippable)
					{
						// Add line of text describing item if in scene
						scene.text.push("[if !items." + item.name + ".owned && items." + item.name + ".scene==thisScene]" + item.seenText + "[/if]");
					}
				});
			}
			
			// Define undefined choices
			var choiceList = [];
			// If we can pick up and drop items here...
			if (scene.hasOwnProperty("canEquipItems") && scene.canEquipItems)
			{
				var newChoicesList = [];
				// Add "Pick up item" choices
				json.items.forEach(function(item) {
					if (!item.hidden && item.equippable)
					{
						// Create a "Pick up item" choice and add it
						var equipChoice = {
							name: "equip-" + item.name,
							text: !isUndefined(item.equipText) ? item.equipText : "Pick up " + item.text,
							requirement: "!items." + item.name + ".owned && items." + item.name + ".scene==thisScene",
							itemActions: [
								{
									action: "add",
									name: item.name
								}
							],
							nextScene: scene.name
						};
						newChoicesList.push(equipChoice);
					}
				});
				// Add "Drop item" choices
				json.items.forEach(function(item) {
					if (!item.hidden && item.equippable)
					{
						// Create a "Drop item" choice and add it
						var unequipChoice = {
							name: "unequip-" + item.name,
							text: !isUndefined(item.unequipText) ? item.unequipText : "Drop " + item.text,
							requirement: "items." + item.name + ".owned",
							itemActions: [
								{
									action: "place",
									name: item.name,
									scene: scene.name
								}
							],
							nextScene: scene.name
						};
						newChoicesList.push(unequipChoice);
					}
				});
				// Add choices to beginning of choice list
				scene.choices.unshift.apply(scene.choices, newChoicesList);
			}
			// If there is a next scene defined...
			if (scene.hasOwnProperty("nextScene"))
			{
				// Create a "Continue" choice and make it the only choice
				var continueChoice = {
					name: "continue",
					text: "Continue",
					nextScene: scene.nextScene,
				};
				scene.choices = [continueChoice];
			}
		});
		// Load some default settings
		if (!json.hasOwnProperty("settings")) json.settings = {};
		if (!json.settings.hasOwnProperty("defaultTickLength")) json.settings.defaultTickLength = 50;
		if (!json.settings.hasOwnProperty("skipRevisitedScenes")) json.settings.skipRevisitedScenes = true;
	}
	
}

// Class for parsing text strings
class Parser {
	
	// Turn story.js tags to HTML tags
	static parseText(text) {
		// We ain't parsing invalid strings
		if (this.validateStoryTags(text))
		{
			// Ignore escaped brackets
			text = text.replace(/\/\[/g, "\u0001").replace(/\/\]/g, "\u0002");
			// Split on brackets
			var textSplit = text.split(/\[|\]/);
			textSplit.forEach(function(line, i, lines) {
				lines[i] = line.replace(/\u0001/g, "[").replace(/\u0002/g, "]");
			});
			// Now every other element of textSplit has a tag name
			var ifIsFalse = false; // True if currently in a false [if] tag
			// Loop through all the tag names in textSplit
			for (var i = 1; i < textSplit.length; i += 2) {
				var s = textSplit[i];
				
				// [choice {choiceID}][/choice]
				// Embed choice with id of {choiceID} in text
				if (s.startsWith("choice "))
				{
					var parsed = s.split("choice ");
					textSplit[i] = `<jw-story-choice choose="${parsed[1]}" disabled>`;
				}
				else if (s.startsWith("/choice"))
				{
					textSplit[i] = `</jw-story-choice>`;
				}
				// [effect {effectType}][/effect]
				// Give text effect of type {effectType} to text
				else if (s.startsWith("effect "))
				{
					var parsed = s.split("effect ");
					textSplit[i] = `<jw-effect type="${parsed[1]}" disabled>`;
				}
				else if (s.startsWith("/effect"))
				{
					textSplit[i] = `</jw-effect>`;
				}
				// [eval][/eval]
				// Evaluate text as JavaScript
				else if (s.startsWith("eval"))
				{
					textSplit[i] = ``
					textSplit[i+1] = Parser.parseJS(textSplit[i+1]);
				}
				else if (s.startsWith("/eval"))
				{
					textSplit[i] = ``;
				}
				// [if {condition}][/if]
				// Display text iff {condition} is true
				else if (s.startsWith("if "))
				{
					var parsed = s.split("if ");
					textSplit[i] = ``;
					// Delete future text if condition if false
					if (!Parser.parseJS(parsed[1])) ifIsFalse = true;
				}
				else if (s.startsWith("/if"))
				{
					textSplit[i] = ``;
					ifIsFalse = false;
				}
				// [pause {tickLength}]
				// Pause for {tickLength} ticks
				else if (s.startsWith("pause "))
				{
					var parsed = s.split("pause ");
					textSplit[i] = `<jw-story-text-pause length="${parsed[1]}" style="display: none;"></jw-story-text-pause>`;
				}
				// [speed {tickSpeed}]
				// Make text go {tickSpeed} times as fast (set to <1 for slower text)
				else if (s.startsWith("speed "))
				{
					var parsed = s.split("speed ");
					textSplit[i] = `<jw-story-text-speed speed="${parsed[1]}" style="display: none;"></jw-story-text-speed>`;
				}
				// [/speed]
				// Reset speed to 1
				else if (s.startsWith("/speed"))
				{
					textSplit[i] = `<jw-story-text-speed speed="1" style="display: none;"></jw-story-text-speed>`;
				}
				// [s{highlightType}][/s]
				// Give text a highlight effect of {highlightType}
				else if (s.startsWith("s"))
				{
					var parsed = s.split("s");
					textSplit[i] = `<jw-story-highlight type="${parsed[1]}">`;
				}
				else if (s.startsWith("/s"))
				{
					textSplit[i] = `</jw-story-highlight>`;
				}
				else {
					textSplit[i] = ``; // Delete tag by default
				}
				
				// Delete text if [if] condition is false
				if (ifIsFalse) {
					textSplit[i] = ``;
					textSplit[i+1] = ``;
				}
			}
			
			// Join the tags with the content
			text = textSplit.join("");
			return text;
		}
	}
	
	// Make sure the story.js tags won't break
	static validateStoryTags(s) {
		var open = 0;
		for (var i = 0; i < s.length; i++) {
			var chr = s[i];
			if (chr == "[")
			{
				// Inc if not an escaped bracket
				if (s[i-1] != "/") open++;
			}
			else if (chr == "]")
			{
				// Dec if not an escaped bracket
				if (s[i-1] != "/") open--;
				// Return false if more closing than opening
				if (open < 0) return false;
			}
		}
		// Return true if opening and closing brackets balanced, false otherwise
		return open == 0;
	}
	
	// Parse JavaScript (don't do it how I'm doing it)
	static parseJS(js) {
		// Set items object to have each item
		var items = {}
		storyData.story.items.forEach(function(item) {
			items[item.name] = item;
		});
		// Set thisScene variable to have the current scene name
		var thisScene = storyData.story.scene.name;
		if (storyData.story.hasOwnProperty("nextScene"))
		{
			// Set nextScene variable to have the next scene name
			var nextScene = storyData.story.nextScene.name;
			// Set thisChoice variable to have this choice's name
			var thisChoice = storyData.story.chosenChoice.name;
		}
		
		// I wish there were a better way
		return eval(js);
	}
	
}

// Class for handling inventory items

class InventoryHandler {
	
	// Execute action with item
	static itemAction(item) {
		// If requirement doesn't exist or if requirement exists and is true
		if (item.hasOwnProperty("requirement") ? Parser.parseJS(item.requirement) : true)
		{
			var itemById = InventoryHandler.getItemById(item.name);
			switch(item.action) {
				case "add":
					itemById.owned = true; // You own the object
					delete itemById.scene; // It's not in any scene
					// DEBUG: show placed items
					console.log(
						`%cYou now own ${itemById.hidden ? "hidden item" : "item"} "${itemById.name}"`,
						consoleStyles.debug
					);
					break;
				case "remove":
					delete itemById.scene; // The object is in no scene
					itemById.owned = false; // You no longer own it
					// DEBUG: show placed items
					console.log(
						`%c${itemById.hidden ? "Hidden item" : "Item"} "${itemById.name}" was just removed"`,
						consoleStyles.debug
					);
					break;
				case "place":
					itemById.scene = item.scene; // The object is in the given scene
					itemById.owned = false; // You no longer own it
					// DEBUG: show placed items
					console.log(
						`%c${itemById.hidden ? "Hidden item" : "Item"} "${itemById.name}" was just placed into scene "${itemById.scene}"`,
						consoleStyles.debug
					);
					break;
			}
		}
	}
	
	// Get item object by item ID
	static getItemById(id) {
		// Loop through every item
		for (var i = 0; i < storyData.story.items.length; i++) {
			var item = storyData.story.items[i];
			// If the IDs match, return this item
			if (item.name == id) return item;
		}
	}
	
}

// Class for handling scene transitions
class SceneHandler {
	
	// Set up a scene
	static setupScene(scene) {
		// Set the scene object
		storyData.story.scene = scene;
		
		// Parse the text
		scene.parsedText = "";
		scene.text.forEach(function(t) {
			scene.parsedText += "<p>" + Parser.parseText(t) + "</p>";
		});
		
		// DEBUG: print out the scene name
		console.log(
			`\n%cScene ID: ${scene.name}\n`,
			consoleStyles.debug
		);
		
		UI.updateText("");
		UI.updateInventory();
		// Print out the text
		return TextPrinter.printText(scene.parsedText);
	}
	
	// Handle exiting the scene
	static exitScene(scene) {
		scene.visited = true;
		if (scene.hasOwnProperty("itemActions"))
		{
			scene.itemActions.forEach(function(item) {
				InventoryHandler.itemAction(item);
			});
		}
		UI.resetChoices();
	}
	
	// Get scene object from scene ID
	static getSceneById(id) {
		// Loop through every scene
		for (var i = 0; i < storyData.story.scenes.length; i++) {
			var scene = storyData.story.scenes[i];
			// If the IDs match, return this scene
			if (scene.name == id) return scene;
		}
	}
	
	// Get choice object from choice ID
	static getChoiceById(id) {
		// Loop through every choice
		for (var i = 0; i < storyData.story.scene.choices.length; i++) {
			var choice = storyData.story.scene.choices[i];
			// If the IDs match, return this choice
			if (choice.name == id) return choice;
		}
	}
	
}

// Class for printing the text character by character
class TextPrinter {
	
	// Print the given text
	static printText(text) {
		var printer = storyData.printer;
		printer.fullText = text;
		var fakeStoryTextEl = document.createElement("jw-story");
		fakeStoryTextEl.innerHTML = printer.fullText;
		// DEBUG: print the full text (without the tags)
		var sceneLines = [];
		fakeStoryTextEl.getElementsByTagName("p").forEach(function(line) {
			if (/\S/.test(line.textContent)) sceneLines.push(line.textContent);
		});
		console.log(
			`%c${sceneLines.join("\n\n")}`,
			consoleStyles.text
		);
		printer.currentText = "";
		printer.currentOffset = -1;
		// Set the tick length
		if (storyData.story.settings.hasOwnProperty("defaultTickLength"))
		{
			printer.tickLength = storyData.story.settings.defaultTickLength;
		}
		else
		{
			printer.tickLength = printer.defaultTickLength;
		}
		printer.tickSpeed = 1;
		printer.printDone = false;
		// If tick length is 0 (or less, somehow), complete right away
		if (printer.tickLength <= 0)
		{
			return this.complete();
		}
		// If we are revisiting this scene and skipping it, complete right away
		if (storyData.story.settings.skipRevisitedScenes && storyData.story.scene.visited)
		{
			return this.complete();
		}
		// Print one character per tick (generally)
		return setTimeout(this.onTick(), printer.tickLength / printer.tickSpeed);
	}
	
	// Reveal a new character
	static onTick() {
		var printer = storyData.printer;
		// If paused, don't do anything
		if (printer.pause > 0) printer.pause--;
		// Otherwise, do something
		if (printer.pause == 0)
		{
			// Complete printing if we've shown all the text
			if (printer.currentOffset >= printer.fullText.length)
			{
				return this.complete();
			}
			// Move past any tags or spaces
			while (" <>".includes(printer.fullText[printer.currentOffset])) {
				this.readTags();
			}
			// Update the text we're showing
			printer.currentText = printer.fullText.substring(0, printer.currentOffset);
			UI.updateText(printer.currentText);
			printer.currentOffset++;
		}
		// Return, and tick again
		return setTimeout(function() {
			TextPrinter.onTick();
		}, printer.tickLength / printer.tickSpeed);
	}
	
	// Move the current offset past any tags
	static readTags() {
		var printer = storyData.printer;
		// If at space or end-of-tag...
		if (" >".includes(printer.fullText[printer.currentOffset]))
		{
			printer.currentOffset++; // Go forward
		}
		// If at beginning-of-tag...
		if (printer.fullText[printer.currentOffset] == "<")
		{
			// Get the tag as a DOM object
			var tagStart = printer.currentOffset;
			printer.currentOffset++;
			while (printer.fullText[printer.currentOffset] != ">") {
				printer.currentOffset++;
			}
			var tagHTML = printer.fullText.substring(tagStart,printer.currentOffset+1);
			var tag = parseHTML(tagHTML)[0];
			// If tag is not an ending tag (this breaks things)...
			if (!isUndefined(tag)) {
				// <jw-story-text-pause length="{pauseLen}">
				// Pause for {pauseLen} ticks
				if (tag.tagName == "JW-STORY-TEXT-PAUSE")
				{
					storyData.printer.pause = tag.getAttribute("length");
				}
				// <jw-story-text-speed speed="{tickSpeed}">
				// Make text go {tickSpeed} times as fast (set to <1 for slower text)
				else if (tag.tagName == "JW-STORY-TEXT-SPEED")
				{
					storyData.printer.tickSpeed = tag.getAttribute("speed");
				}
			}
		}
	}
	
	// Instantly complete text printing
	static complete() {
		var printer = storyData.printer;
		
		printer.printDone = true;
		printer.currentOffset = 0;
		printer.currentText = printer.fullText; // We have the full text now
		UI.updateText(printer.fullText);
		// Un-disable every disabled thingy
		document.getElementsByTagName("jw-story")[0].getElementsByTagName("*").forEach(function(el) {
			el.removeAttribute("disabled");
		});
		if (!(storyData.story.scene.hasOwnProperty("isEnding") && storyData.story.scene.isEnding))
		{
			UI.updateChoices();
			// DEBUG: print inventory
			storyData.story.items.forEach(function(item) {
				console.log(
					`%c${!isUndefined(item.text) ? item.text : "unnamed item"} %c(${item.name})%c${item.hidden ? " [hidden]" : ""}\n`,
					!isUndefined(item.text) ? (item.owned ? consoleStyles.trueVal : consoleStyles.falseVal) : consoleStyles.debug, item.owned ? consoleStyles.trueVal : consoleStyles.falseVal, consoleStyles.debug
				);
			});
		}
		UI.scrollToBottom();
		return storyData.story.scene.hasOwnProperty("isEnding") && storyData.story.scene.isEnding;
	}
	
}

// Class for handling visuals
class UI {
	
	// Initialize all the tags and such I'll be using
	static init() {
		var storyEl = document.getElementsByTagName("jw-story")[0];
		
		// Insert all our custom tags
		storyEl.innerHTML = `<!-- All this content is injected woohoo -->
		<jw-story-text></jw-story-text>
		<jw-story-choice-list></jw-story-choice-list>
		<jw-story-inv>
			<jw-story-inv-list></jw-story-inv-list>
		</jw-story-inv>`
		
		// Configure the behavior for clicking on choices
		document.addEventListener("click", function(e) {
			if (e.target && e.target.tagName == "JW-STORY-CHOICE") // Capital because reasons
			{
				var choiceButton = e.target;
				
				if (!choiceButton.hasAttribute("disabled"))
				{
					var choice = SceneHandler.getChoiceById(choiceButton.getAttribute("choose"));
					if (choice.hasOwnProperty("requirement") ? Parser.parseJS(choice.requirement) : true)
					{
						
						// DEBUG: Print chosen choice info
						console.log(
							`%cYou chose: %c${choice.text} %c(${choice.name})`,
							consoleStyles.text, consoleStyles.choice, consoleStyles.debug
						)
						if (choice.hasOwnProperty("itemActions"))
						{
							choice.itemActions.forEach(function(item) {
								InventoryHandler.itemAction(item);
							});
						}
						var nextScene = SceneHandler.getSceneById(choice.nextScene);
						storyData.story.nextScene = nextScene; // Temp property
						storyData.story.chosenChoice = choice; // Temp property
						SceneHandler.exitScene(storyData.story.scene);
						SceneHandler.setupScene(storyData.story.nextScene);
						delete storyData.story.nextScene; // Delete temp property
						delete storyData.story.chosenChoice; // Delete temp property
					}
				}
			}
		});
	}
	
	// Update the text in the text tag
	static updateText(text) {
		// If only there was a way to do this and not restart CSS effects/animations
		var storyTextEl = document.getElementsByTagName("jw-story-text")[0];
		storyTextEl.innerHTML = text;
		this.scrollToBottom();
	}
	
	// Update the choices in the choices list
	static updateChoices() {
		// Get rid of the choices that are there already
		this.resetChoices();
		// Add each choice
		storyData.story.scene.choices.forEach(function(choice) {
			// DEBUG: show choice text and internal name
			console.log(
				`%c${choice.text}\n%c(${choice.name}) \u27f6 ${choice.nextScene}${choice.hasOwnProperty("requirement") ? "\nRequirement: %c"+choice.requirement : "%c"}`,
				consoleStyles.choice, consoleStyles.debug, Parser.parseJS(choice.requirement) ? consoleStyles.trueVal : consoleStyles.falseVal
			);
			UI.addChoice(choice);
		});
	}
	
	// Add a choice to the choice list
	static addChoice(choice) {
		// If requirement doesn't exist or if requirement exists and is true
		if (choice.hasOwnProperty("requirement") ? Parser.parseJS(choice.requirement) : true)
		{
			var storyChoiceListEl = document.getElementsByTagName("jw-story-choice-list")[0];
			var newChoiceEl = document.createElement("jw-story-choice");
			
			newChoiceEl.setAttribute("choose", choice.name);
			newChoiceEl.innerHTML = Parser.parseText(choice.text);
			storyChoiceListEl.appendChild(newChoiceEl);
		}
	}
	
	// Reset the choices list
	static resetChoices() {
		var storyChoiceListEl = document.getElementsByTagName("jw-story-choice-list")[0];
		storyChoiceListEl.innerHTML = "";
	}
	
	// Update the inventory list
	static updateInventory() {
		this.resetInventory();
		storyData.story.items.forEach(function(item) {
			if (item.owned) UI.addItem(item);
		});
	}
	
	// Add an item to the inventory list
	static addItem(item) {
		if (!item.hidden)
		{
			var storyInvEl = document.getElementsByTagName("jw-story-inv-list")[0];
			var newItemEl = document.createElement("jw-story-inv-item");
			
			newItemEl.innerHTML = Parser.parseText(item.text);
			storyInvEl.appendChild(newItemEl);
			tippy(newItemEl, {
				content: item.description,
				placement: "top-start",
				maxWidth: storyInvEl.clientWidth
			});
		}
	}
	
	// Reset the inventory list
	static resetInventory() {
		var storyInvEl = document.getElementsByTagName("jw-story-inv-list")[0];
		storyInvEl.innerHTML = ``;
	}
	
	// Scroll to the bottom of the story
	static scrollToBottom() {
		var storyEl = document.getElementsByTagName("jw-story")[0];
		// Create invisible div element after the end of the story element
		var storyBottomEl = storyEl.appendChild(document.createElement("div"));
		// Scroll it into view
		storyBottomEl.scrollIntoView();
		// Now we don't need that element anymore
		storyBottomEl.remove();
	}
	
}

// Now the REAL code begins

// Global story data
storyData = {
	story: null,
	choices: null,
	printedText: "",
	printer: {
		fullText: "",
		currentText: "",
		currentOffset: 0,
		tickLength: 0,
		tickSpeed: 1,
		pause: 0,
		printDone: false
	}
}

// Console styles (for nicely-formatted debug text)
consoleStyles = {
	title: "font-family: Garamond, Times New Roman, sans-serif; font-size: 3em; font-weight: bold;",
	text: "font-family: Helvetica, Arial, sans-serif;",
	choice: "color: dodgerblue; font-family: Arial Black, sans-serif;",
	debug: "color: gray; font-family: Arial, sans-serif; font-size: .9em;",
	trueVal: "color: green; font-family: Arial, sans-serif; font-size: .9em;",
	falseVal: "color: red; font-family: Arial, sans-serif; font-size: .9em;",
}

window.onload = function() {
	// Declarations
	// Nothing here but us chickens
	
	// Start our story!
	StoryPlayer.start();
};