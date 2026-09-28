import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AssetFamiliesController } from './asset-families.controller';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

describe('Retired family configuration API', () => {
  const routes = (controller: { prototype: object }) =>
    Object.getOwnPropertyNames(controller.prototype)
      .filter(name => name !== 'constructor')
      .map(name => Reflect.getMetadata(PATH_METADATA, controller.prototype[name]));

  it('does not expose the old family rule reads or mutations', () => {
    expect(routes(AssetFamiliesController).filter(path => String(path).includes('components'))).toEqual([]);
    expect(routes(AssetFamiliesController)).toContain(':assetFamilyId/subfamilies');
  });

  it('does not expose document-time component choices or motor assignment', () => {
    expect(routes(AssetsController).filter(path => /component-options|assigned-motor/.test(String(path)))).toEqual([]);
    expect(routes(AssetsController)).toContain(':assetId/condition');
  });

  it('removes the unused legacy configurator implementation, not historical database records', () => {
    for (const name of ['listAssetFamilyComponents', 'createAssetFamilyComponent', 'updateAssetFamilyComponent', 'deleteAssetFamilyComponent', 'getAssetComponentOptions'])
      expect(AssetsService.prototype).not.toHaveProperty(name);
  });
});
