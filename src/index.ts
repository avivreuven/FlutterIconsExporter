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
        svgFiles.push(FileHelper.createCopyRemoteFile({
          relativePath: "./assets",
          fileName: `${assetName}.svg`,
          url: asset.svgUrl,
        }))
      }
    } catch (error) {
      console.log(error)
    }
  }
  assetNames = assetNames.sort((a,b) => a.localeCompare(b))

  return svgFiles
})

export const exportConfiguration = Pulsar.exportConfig<ExporterConfiguration>()

