import { FileHelper } from "@supernovaio/export-helpers"
import { Supernova, PulsarContext, RemoteVersionIdentifier, AnyOutputFile, TokenType, ColorToken, TokenGroup, DimensionToken, TypographyToken, Token, TokenTheme } from "@supernovaio/sdk-exporters"
import { ExporterConfiguration } from "../config"

Pulsar.export(async (sdk: Supernova, context: PulsarContext): Promise<Array<AnyOutputFile>> => {
  const remoteVersionIdentifier: RemoteVersionIdentifier = {
    designSystemId: context.dsId,
    versionId: context.versionId,
  }

  let assets = await sdk.assets.getAssets(remoteVersionIdentifier)
  let assetGroups = await sdk.assets.getAssetGroups(remoteVersionIdentifier)

  if (context.brandId) {
    assets = assets.filter((asset) => asset.brandId === context.brandId)
    assetGroups = assetGroups.filter((assetGroup) => assetGroup.brandId === context.brandId)
  }

  var assetNames = new Array<string>()
  var svgFiles = new Array<AnyOutputFile>()
  var iconMappings = new Array<{name: string, codepoint: number}>()

  // Start codepoint from 0xe900 (like in your reference file)
  let currentCodepoint = 0xe900

  for (let asset of assets) {
    try {
      if (asset.svgUrl !== null && asset.origin?.name?.startsWith('Icons/')) {
        var assetName = asset.name.toLowerCase()
        assetName = assetName.replace(/[^a-zA-Z0-9 ]/g, ' ')
        assetName = assetName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
        assetName = assetName.charAt(0).toLowerCase() + assetName.slice(1)
        
        var dup = 1
        while (assetNames.includes(assetName)) {
          assetName = `${assetName}${dup}`
          dup++
        }
        assetNames.push(assetName)
        
        // Store the mapping for Dart file generation
        iconMappings.push({
          name: assetName,
          codepoint: currentCodepoint
        })
        
        svgFiles.push(FileHelper.createCopyRemoteFile({
          relativePath: "./temp_svgs",
          fileName: `${assetName}.svg`,
          url: asset.svgUrl,
        }))
        
        currentCodepoint++
      }
    } catch (error) {
      console.log(`Error processing asset ${asset.name}:`, error)
    }
  }
  
  // Sort asset names and mappings
  assetNames = assetNames.sort((a,b) => a.localeCompare(b))
  iconMappings = iconMappings.sort((a,b) => a.name.localeCompare(b.name))

  // Generate Dart file content
  const dartFileContent = generateDartFile(iconMappings)
  
  // Create Dart file
  const dartFile = FileHelper.createTextFile({
    relativePath: "./",
    fileName: "se_icons.dart",
    content: dartFileContent
  })

  // Generate font creation script
  const fontGenerationScript = generateFontScript(iconMappings)
  const scriptFile = FileHelper.createTextFile({
    relativePath: "./",
    fileName: "generate_font.js",
    content: fontGenerationScript
  })

  // Generate automated workflow script
  const workflowScript = generateWorkflowScript()
  const workflowFile = FileHelper.createTextFile({
    relativePath: "./",
    fileName: "auto_generate_font.js",
    content: workflowScript
  })

  // Generate package.json script entry instructions
  const instructionsFile = FileHelper.createTextFile({
    relativePath: "./",
    fileName: "AUTOMATION_SETUP.md",
    content: generateAutomationInstructions()
  })

  return [...svgFiles, dartFile, scriptFile, workflowFile, instructionsFile]
})

function generateDartFile(iconMappings: Array<{name: string, codepoint: number}>): string {
  const header = `// Place fonts/seIcons.ttf in your fonts/ directory and
// add the following to your pubspec.yaml
// flutter:
//   fonts:
//    - family: seIcons
//      fonts:
//       - asset: fonts/seIcons.ttf

// ignore_for_file: constant_identifier_names

import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';

class SEIcons {
  SEIcons._();

  static const String _fontFamily = 'seIcons';

`

  const iconDefinitions = iconMappings.map(mapping => 
    `  static const IconData ${mapping.name} = IconData(0x${mapping.codepoint.toString(16)}, fontFamily: _fontFamily);`
  ).join('\n')

  const footer = `
}`

  return header + iconDefinitions + footer
}

function generateFontScript(iconMappings: Array<{name: string, codepoint: number}>): string {
  return `const svgtofont = require('svgtofont');
const path = require('path');
const fs = require('fs');

async function generateFont() {
  try {
    // Ensure directories exist
    if (!fs.existsSync('fonts')) {
      fs.mkdirSync('fonts', { recursive: true });
    }

    await svgtofont({
      src: path.resolve(process.cwd(), 'temp_svgs'),
      dist: path.resolve(process.cwd(), 'fonts'),
      fontName: 'seIcons',
      css: false,
      outSVGReact: false,
      outSVGPath: false,
      generateInfoData: false,
      svgicons2svgfont: {
        fontHeight: 1000,
        normalize: true
      }
    });
    
    console.log('✅ Font generated successfully at fonts/seIcons.ttf');
    console.log('✅ Dart file generated at se_icons.dart');
    console.log('');
    console.log('📱 To use in Flutter:');
    console.log('1. Copy fonts/seIcons.ttf to your Flutter project\\'s fonts/ directory');
    console.log('2. Copy se_icons.dart to your Flutter project');
    console.log('3. Add the font to your pubspec.yaml (see instructions in se_icons.dart)');
    
    // Clean up temp SVG files
    if (fs.existsSync('temp_svgs')) {
      fs.rmSync('temp_svgs', { recursive: true, force: true });
      console.log('🧹 Cleaned up temporary SVG files');
    }
    
  } catch (error) {
    console.error('❌ Error generating font:', error);
    process.exit(1);
  }
}

generateFont();
`
}

function generateWorkflowScript(): string {
  return `#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Auto font generation workflow
// This script can be triggered automatically after Supernova export

console.log('🚀 Starting automated font generation...');

// Check if temp_svgs directory exists (means export just completed)
if (!fs.existsSync('temp_svgs')) {
  console.log('⏳ Waiting for SVG files to be exported...');
  setTimeout(checkAndGenerate, 2000); // Wait 2 seconds then check
} else {
  generateFontNow();
}

function checkAndGenerate() {
  if (fs.existsSync('temp_svgs')) {
    generateFontNow();
  } else {
    console.log('❌ No SVG files found. Make sure the Supernova export completed successfully.');
    process.exit(1);
  }
}

function generateFontNow() {
  console.log('📁 SVG files found, generating font...');
  
  const child = spawn('node', ['generate_font.js'], {
    stdio: 'inherit',
    shell: true
  });
  
  child.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Automated font generation completed successfully!');
    } else {
      console.log(\`❌ Font generation failed with code \${code}\`);
      process.exit(code);
    }
  });
  
  child.on('error', (error) => {
    console.error('❌ Error running font generation:', error);
    process.exit(1);
  });
}
`
}

function generateAutomationInstructions(): string {
  return `# Font Generation Automation Setup

This exporter now generates everything needed to automatically create TTF fonts from your SVG icons.

## Files Generated

- \`se_icons.dart\` - Flutter IconData constants
- \`temp_svgs/\` - SVG files from your design system  
- \`generate_font.js\` - Font generation script
- \`auto_generate_font.js\` - Automated workflow script

## Option 1: Manual Font Generation

After running the Supernova export:

\`\`\`bash
npm run generate-font
\`\`\`

## Option 2: Automated Font Generation 

### Setup (One Time)

1. **Add to your package.json scripts:**
\`\`\`json
{
  "scripts": {
    "generate-font": "node generate_font.js",
    "auto-font": "node auto_generate_font.js",
    "post-export": "npm run auto-font"
  }
}
\`\`\`

2. **For CI/CD Integration:**
Add this to your build pipeline after Supernova export:
\`\`\`bash
npm run post-export
\`\`\`

### How It Works

1. **Supernova Export** → Downloads SVGs to \`temp_svgs/\`
2. **Auto Detection** → \`auto_generate_font.js\` detects new SVGs
3. **Font Generation** → Automatically runs \`generate_font.js\`
4. **Cleanup** → Removes temporary files
5. **Ready** → \`fonts/seIcons.ttf\` and \`se_icons.dart\` ready for Flutter

## Integration with Supernova.io Workflows

If you're using Supernova.io's CI/CD features or webhooks:

1. **Webhook Setup**: Configure your webhook to run \`npm run post-export\` after export
2. **GitHub Actions**: Add the font generation step to your workflow
3. **Local Development**: Run \`npm run auto-font\` in watch mode

## Flutter Integration

1. Copy \`fonts/seIcons.ttf\` to your Flutter project's \`fonts/\` directory
2. Copy \`se_icons.dart\` to your Flutter project
3. Add font configuration to \`pubspec.yaml\` (instructions in se_icons.dart)
4. Use icons: \`Icon(SEIcons.iconName)\`

## Benefits of Automation

✅ **Zero Manual Steps** - Font generation happens automatically
✅ **Consistent Builds** - Same process every time  
✅ **CI/CD Ready** - Works in automated environments
✅ **Error Handling** - Clear error messages and exit codes
✅ **Clean Workspace** - Temporary files are automatically cleaned up

## Troubleshooting

- **"No SVG files found"**: Ensure Supernova export completed successfully
- **Permission errors**: Make sure the script has write permissions for fonts/ directory  
- **Build failures**: Check that svgtofont dependency is installed (\`npm install\`)
`
}

export const exportConfiguration = Pulsar.exportConfig<ExporterConfiguration>()

