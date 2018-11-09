'use strict';

import axios from 'axios'
import { render } from 'ejs'
import JSZip from 'jszip'

export default {
	alignComments(file) {
		let lines = file.split('\n');
		let maxCommandLength = 0;

		// Find out how long the maximum command is
		lines.forEach(function(line) {
			var index = line.indexOf(";");
			if (index == 1) {
				index = line.substr(1).indexOf(";") - 1;
			}

			if (index > maxCommandLength) {
				maxCommandLength = index;
			}
		});

		// Align line comments
		let newResult = "";
		lines.forEach(function(line) {
			let index = line.indexOf(";"), startingWithComment = (index == 0);
			if (startingWithComment) {
				line = line.substr(1);
				index = line.indexOf(";");
			}

			if (index == -1) {
				newResult += (startingWithComment ? ";" : "") + line + "\n";
			} else {
				let commandPart = (startingWithComment ? ";" : "") + line.substr(0, index - 1);
				let commentPart = line.substr(index);
				for(let i = commandPart.length; i < maxCommandLength; i++) {
					commandPart += " ";
				}
				newResult += commandPart + commentPart + "\n";
			}
		});

		return newResult;
	},

	async compileFile(filename, options) {
		let content = await axios.get(filename, { responseType: "text" });
		content = render(content.data, options);
		return content;
	},

	async compileTemplate(filename, template, board) {
		let options = { template, board, util: this.util(template) };

		// tfree/tpre/tpost macros share the same file but need another parameter 'index'
		let targetFilename = "templates/" + filename.replace(".g", ".ejs");
		if (filename.startsWith("tfree")) {
			targetFilename = "templates/tfree.ejs";
			options.index = parseInt(filename.match("tfree(\\d+).g")[1]);
		} else if (filename.startsWith("tpre")) {
			targetFilename = "templates/tpre.ejs";
			options.index = parseInt(filename.match("tpre(\\d+).g")[1]);
		} else if (filename.startsWith("tpost")) {
			targetFilename = "templates/tpost.ejs";
			options.index = parseInt(filename.match("tpost(\\d+).g")[1]);
		}

		const content = await this.compileFile(targetFilename, options);
		return this.alignComments(content);
	},

	async compileZIP(filenames, template, board) {
		let zip = new JSZip();
		zip.file("config.json", JSON.stringify(template));

		// Generate config macros
		for(let i = 0; i < filenames.length; i++) {
			try {
				const content = await this.compileTemplate(filenames[i], template, board);
				zip.file("sys/" + filenames[i], content);
			} catch (e) {
				throw `Failed to create ${filenames[i]}: ${e}`
			}
		}

		// TODO: Perhaps add DWC here?

		// Generate final ZIP when all files have been generated
		return await zip.generateAsync({ type: "blob" });
	},

	canDownloadFiles: JSZip.support.blob,

	util(template) {
		return {
			getFirmwareString() {
				switch (template.firmware) {
					case 1.16: return "1.16 or older";
					case 1.17: return "1.17 to 1.19";
					case 1.20: return "1.20 or newer";
				}
				return template.firmware.toString();
			},

			makeDriveString(property, factor) {
				let result = "X" + (template.drives[0][property] * factor).toFixed(2);
				result += " Y" + (template.drives[1][property] * factor).toFixed(2);
				result += " Z" + (template.drives[2][property] * factor).toFixed(2);
				for(let i = 3; i < template.drives.length; i++) {
					if (i == 3) {
						result += " E" + (template.drives[i][property] * factor).toFixed(2);
					} else {
						result += ":" + (template.drives[i][property] * factor).toFixed(2);
					}
				}
				return result;
			},

			getFirstProbePoint(axis) {
				if (template.probe.points == 0) {
					return (axis == 0) ? template.mesh.x_min : template.mesh.y_min;
				}
				return (axis == 0) ? template.probe.points[0].x : template.probe.points[0].y;
			}
		}
	}
}
