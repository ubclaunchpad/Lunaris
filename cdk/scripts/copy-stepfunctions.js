const fs = require("fs");
const path = require("path");

const sourceDir = path.join(__dirname, "../stepfunctions");
const destDir = path.join(__dirname, "../dist/stepfunctions");

// Create destination directory if it doesn't exist
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

// Recursive function to copy directories and files
// Only copies .json and .js/.d.ts (compiled) files, not .ts source files
function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);

    files.forEach((file) => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            // Only copy compiled files (.js, .d.ts, .map) and definition files (.json, .asl.json)
            if (file.endsWith('.js') || file.endsWith('.d.ts') || file.endsWith('.map') || file.endsWith('.json')) {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    });
}

try {
    copyRecursive(sourceDir, destDir);
    console.log("Successfully copied stepfunctions directory to dist");
} catch (error) {
    console.error("Error copying stepfunctions:", error);
    process.exit(1);
}
