import * as fs from 'fs-plus';
import * as path from 'path';

import {exceptionHelper} from '../exceptionHelper';

import {AZ3166Device} from './AZ3166Device';
import {Component} from './Interfaces/Component';
import {Provisionable} from './Interfaces/Provisionable';
import {IoTHub} from './IoTHub';

const constants = {
  deviceDefaultFolderName: 'Device',
  functionDefaultFolderName: 'Function',
  configFileName: 'iotstudio.config.json'
};

const jsonConstants = {
  DevicePath: 'DevicePath',
  IoTHubName: 'IoTHubName'
};

interface ProjectSetting {
  name: string;
  value: string;
}

export enum ProjectTemplateType {
  basic = 1,
  IotHub,
  Function
}

export class IoTProject {
  private componentList: Component[];
  private projectRootPath: string;
  private projectType: ProjectTemplateType;

  private addComponent(comp: Component) {}

  private canProvision(comp: {}): comp is Provisionable {
    return (comp as Provisionable).provision !== undefined;
  }

  constructor() {
    this.componentList = [];
  }

  load(rootFolderPath: string): boolean {
    if (!fs.existsSync(rootFolderPath)) {
      exceptionHelper(
          'Unable to find the root path, please open an IoT Studio project',
          true);
    }

    this.projectRootPath = rootFolderPath;

    const configFilePath =
        path.join(this.projectRootPath, constants.configFileName);

    if (!fs.existsSync(configFilePath)) {
      exceptionHelper(
          'Unable to open the configuration file, please open an IoT Studio project',
          true);
    }

    const settings = require(configFilePath);

    const deviceLocation = settings.projectsettings.find(
        (obj: ProjectSetting) => obj.name === jsonConstants.DevicePath);

    if (deviceLocation) {
      const device = new AZ3166Device(deviceLocation.value);
      this.componentList.push(device);
    }

    const hubName = settings.projectsettings.find(
        (obj: ProjectSetting) => obj.name === jsonConstants.IoTHubName);

    if (hubName) {
      const iotHub = new IoTHub();
      this.componentList.push(iotHub);
    }

    // Component level load
    this.componentList.forEach((element: Component) => {
      element.load();
    });

    return true;
  }

  compile(): boolean {
    return true;
  }

  upload(): boolean {
    return true;
  }

  async provision(): Promise<boolean> {
    return new Promise(
        async (
            resolve: (value: boolean) => void,
            reject: (value: boolean) => void) => {
          for (const item of this.componentList) {
            if (this.canProvision(item)) {
              const res = await item.provision();
              if (res === false) {
                reject(false);
                return;
              }
            }
          }
          resolve(true);
        });
  }

  deploy(): boolean {
    return true;
  }

  create(rootFolderPath: string, templateType: ProjectTemplateType): boolean {
    if (!fs.existsSync(rootFolderPath)) {
      exceptionHelper(
          'Unable to find the root path, please open the folder and initialize project again.',
          true);
    }

    this.projectRootPath = rootFolderPath;
    this.projectType = templateType;

    // Whatever the template is, we will always create the device.
    const deviceDir =
        path.join(this.projectRootPath, constants.deviceDefaultFolderName);

    if (!fs.existsSync(deviceDir)) {
      fs.mkdirSync(deviceDir);
    }

    const device = new AZ3166Device(deviceDir);
    this.componentList.push(device);

    // TODO: Consider naming for project level settings.
    const settings = {projectsettings: [] as ProjectSetting[]};
    settings.projectsettings.push(
        {name: jsonConstants.DevicePath, value: deviceDir});

    switch (templateType) {
      case ProjectTemplateType.basic:
        // Save data to configFile
        break;
      case ProjectTemplateType.IotHub:
        const iothub = new IoTHub();
        // In setting file, create a place holder for iothub name
        settings.projectsettings.push(
            {name: jsonConstants.IoTHubName, value: ''});
        this.componentList.push(iothub);
        break;
      case ProjectTemplateType.Function:
      default:
        break;
    }

    const configFilePath =
        path.join(this.projectRootPath, constants.configFileName);
    const jsonToSave = JSON.stringify(settings, null, 4);
    fs.writeFileSync(configFilePath, jsonToSave);

    // Component level creation
    this.componentList.forEach((element: Component) => {
      element.create();
    });

    return true;
  }

  setDeviceConnectionString(deviceConnectionString: string): boolean {
    return true;
  }
}