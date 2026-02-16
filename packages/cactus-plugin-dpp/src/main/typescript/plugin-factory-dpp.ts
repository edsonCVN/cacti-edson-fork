import {
  IPluginFactoryOptions,
  PluginFactory,
} from "@hyperledger/cactus-core-api";
import { IPluginDppOptions, PluginDpp } from "./plugin-dpp";

export class PluginFactoryDpp extends PluginFactory<
  PluginDpp,
  IPluginDppOptions,
  IPluginFactoryOptions
> {
  async create(pluginOptions: IPluginDppOptions): Promise<PluginDpp> {
    return new PluginDpp(pluginOptions);
  }
}
