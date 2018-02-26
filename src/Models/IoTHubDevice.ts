import * as iothub from 'azure-iothub';
import {clearInterval} from 'timers';
import * as vscode from 'vscode';

import {ConfigHandler} from '../configHandler';
import {ConfigKey} from '../constants';

import {getExtension} from './Apis';
import {extensionName} from './Interfaces/Api';
import {Component, ComponentType} from './Interfaces/Component';
import {Provisionable} from './Interfaces/Provisionable';

interface DeviceInfo {
  iothubDeviceConnectionString: string;
}

export class IoTHubDevice {
  private iotHubConnectionString: string|undefined;
  private channel: vscode.OutputChannel;

  constructor(channel: vscode.OutputChannel) {
    this.channel = channel;
    this.iotHubConnectionString =
        ConfigHandler.get<string>(ConfigKey.iotHubConnectionString);
  }

  async provision(): Promise<boolean> {
    if (!this.iotHubConnectionString) {
      throw new Error('No IoT Hub connection string found.');
    }
    const provisionIothubDeviceSelection: vscode.QuickPickItem[] = [
      {
        label: 'Select an existing IoT Hub device',
        description: 'Select an existing IoT Hub device',
        detail: 'select'
      },
      {
        label: 'Create a new IoT Hub device',
        description: 'Create a new IoT Hub device',
        detail: 'create'
      }
    ];
    const selection = await vscode.window.showQuickPick(
        provisionIothubDeviceSelection,
        {ignoreFocusOut: true, placeHolder: 'Provision IoTHub Device'});

    if (!selection) {
      return false;
    }

    const toolkit = getExtension(extensionName.Toolkit);
    if (toolkit === undefined) {
      const error = new Error('Toolkit is not installed.');
      throw error;
    }

    let device = null;
    try {
      switch (selection.detail) {
        case 'select':
          device = await toolkit.azureIoTExplorer.getDevice(null, this.iotHubConnectionString);
          if (device === undefined) {
            throw new Error('Cannot select the specific device');
          } else {
            await ConfigHandler.update(
                ConfigKey.iotHubDeviceConnectionString,
                device.iothubDeviceConnectionString);
          }
          break;

        case 'create':
          device =
              await toolkit.azureIoTExplorer.createDevice(false, this.iotHubConnectionString);
          if (device === undefined) {
            const error = new Error('Cannot create device.');
            throw error;
          } else {
            await ConfigHandler.update(
                ConfigKey.iotHubDeviceConnectionString,
                device.iothubDeviceConnectionString);
          }
          break;
        default:
          break;
      }
      return true;
    } catch (error) {
      throw error;
    }
  }
}

// As toolkit extension export api for device is not ready,
// the below code is a temp solution.

async function getDeviceList(iotHubConnectionString: string):
    Promise<vscode.QuickPickItem[]> {
  return new Promise(
      (resolve: (value: vscode.QuickPickItem[]|undefined) => void,
       reject: (error: Error) => void) => {
        const registry: iothub.Registry =
            iothub.Registry.fromConnectionString(iotHubConnectionString);
        registry.list((err, list) => {
          if (err) {
            return reject(err);
          }
          if (list === undefined) {
            return resolve([]);
          }

          const deviceList: vscode.QuickPickItem[] = [];
          const hostnameMatch = iotHubConnectionString.match(/HostName=(.*?);/);
          let hostname: string|null = null;
          if (hostnameMatch !== null && hostnameMatch.length > 1) {
            hostname = hostnameMatch[1];
          }

          list.forEach(deviceInfo => {
            const deviceId = deviceInfo.deviceId;
            let deviceKey = null;
            if (deviceInfo.authentication &&
                deviceInfo.authentication.symmetricKey) {
              deviceKey = deviceInfo.authentication.symmetricKey.primaryKey;
            }
            const iothubDeviceConnectionString =
                `HostName=${hostname as string};DeviceId=${
                    deviceId};SharedAccessKey=${deviceKey}`;
            deviceList.push({
              label: deviceId,
              description: hostname as string,
              detail: iothubDeviceConnectionString
            });
          });

          resolve(deviceList);
        });
      });
}

async function selectDevice(iotHubConnectionString: string):
    Promise<DeviceInfo|undefined> {
  const deviceList = getDeviceList(iotHubConnectionString);
  const selection = await vscode.window.showQuickPick(
      deviceList, {ignoreFocusOut: true, placeHolder: 'Select IoT Hub device'});
  if (!selection || !selection.detail) {
    return undefined;
  }
  return ({'iothubDeviceConnectionString': selection.detail});
}

async function createDevice(
    iotHubConnectionString: string,
    channel: vscode.OutputChannel): Promise<DeviceInfo|undefined> {
  const deviceId =
      await vscode.window.showInputBox({prompt: 'Enter device ID to create'});

  if (!deviceId) {
    return undefined;
  }

  channel.show();
  channel.appendLine('Provision IoTHub Device');
  const provisionPendding = setInterval(() => {
    channel.append('.');
  }, 1000);

  const deviceInfo =
      await createDeviceWrapper(iotHubConnectionString, deviceId);

  channel.appendLine('.');
  clearInterval(provisionPendding);

  return deviceInfo;
}

async function createDeviceWrapper(
    iotHubConnectionString: string,
    deviceId: string): Promise<DeviceInfo|undefined> {
  return new Promise(
      (resolve: (value: DeviceInfo|undefined) => void,
       reject: (error: Error) => void) => {
        const registry: iothub.Registry =
            iothub.Registry.fromConnectionString(iotHubConnectionString);
        const device: iothub.Registry.DeviceDescription = {deviceId};

        registry.create(device, (err, deviceInfo, res) => {
          if (err) {
            return reject(err);
          } else {
            if (deviceInfo === undefined) {
              return resolve(undefined);
            } else {
              const hostnameMatch =
                  iotHubConnectionString.match(/HostName=(.*?);/);
              let hostname: string|null = null;
              if (hostnameMatch !== null && hostnameMatch.length > 1) {
                hostname = hostnameMatch[1];
              }

              const deviceId = deviceInfo.deviceId;
              let deviceKey = null;
              if (deviceInfo.authentication &&
                  deviceInfo.authentication.symmetricKey) {
                deviceKey = deviceInfo.authentication.symmetricKey.primaryKey;
              }
              const iothubDeviceConnectionString = `HostName=${
                  hostname};DeviceId=${deviceId};SharedAccessKey=${deviceKey}`;
              return resolve({
                'iothubDeviceConnectionString': iothubDeviceConnectionString
              });
            }
          }
        });
      });
}