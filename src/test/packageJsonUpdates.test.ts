import { describe, expect, test } from '@jest/globals';
import { copyProjectName, copyProjectDescription, copyVersion, setUpInstallationLink } from '../commands/appversion/copiers';

describe('package.json updates', () => {
    test('copy project name', async () => {
        const sfdxProjectJson = {
            name: 'myProject',
            packageDirectories: [
                {
                    default: true,
                    versionDescription: 'My project description',
                    versionNumber: '1.0.0'
                }
            ]
        };

        const packageJsonObj = {
            name: 'oldName'
        };

        const settings = {
            copyProjectNameToPackageJson: true
        };

        copyProjectName(settings, packageJsonObj, sfdxProjectJson);

        expect(packageJsonObj.name).toBe('myProject');
    });

    test('copy project description', async () => {
        const sfdxProjectJson = {
            name: 'myProject',
            packageDirectories: [
                {
                    default: true,
                    versionDescription: 'My project description',
                    versionNumber: '1.0.0'
                }
            ]
        };

        const packageJsonObj = {
            description: 'oldDescription'
        };

        const settings = {
            copyProjectDescriptionToPackageJson: true
        };

        copyProjectDescription(settings, packageJsonObj, sfdxProjectJson.packageDirectories[0]);

        expect(packageJsonObj.description).toBe('My project description');
    });

    test('copy version', async () => {
        const sfdxProjectJson = {
            name: 'myProject',
            packageDirectories: [
                {
                    default: true,
                    versionDescription: 'My project description',
                    versionNumber: '1.0.0.NEXT'
                }
            ],
            "packageAliases": {
                "myProject": "0Ho000000000000AAA",
                "myProject@1.0.0-1": "04t000000000000AAA",
                "myProject@1.0.0-2": "04t000000000000AAA",
                "myProject@1.0.0-3": "04t000000000000AAA"
            }
        };

        const packageJsonObj = {
            version: '0.0.0'
        };

        const settings = {
            copyVersionToPackageJson: true
        };

        copyVersion(settings, packageJsonObj, sfdxProjectJson.packageDirectories[0]);

        expect(packageJsonObj.version).toBe('1.0.0');
    });

    test('copy highest version', async () => {
        const sfdxProjectJson = {
            name: 'myProject',
            packageDirectories: [
                {
                    default: true,
                    versionDescription: 'My project description',
                    versionNumber: '1.2.0.NEXT'
                }
            ],
            "packageAliases": {
                "myProject": "0Ho000000000000AAA",
                "myProject@1.0.0-1": "04t000000000000AAA",
                "myProject@1.1.0-2": "04t000000000000AAA",
                "myProject@1.2.0-3": "04t000000000000AAA"
            }
        };

        const packageJsonObj = {
            version: '0.0.0'
        };

        const settings = {
            copyVersionToPackageJson: true
        };

        copyVersion(settings, packageJsonObj, sfdxProjectJson.packageDirectories[0]);

        expect(packageJsonObj.version).toBe('1.2.0');
    });

    test('set up version installation link', async () => {
        const sfdxProjectJson = {
            name: 'myProject',
            packageDirectories: [
                {
                    default: true,
                    versionDescription: 'My project description',
                    versionNumber: '1.2.0.NEXT'
                }
            ],
            packageAliases: {
                "myProject": "0Ho000000000000AAA",
                "myProject@1.1.0-2": "04t000000000002AAA",
                "myProject@1.2.0-3": "04t000000000003AAA", // actual latest
                "myProject@1.0.0-1": "04t000000000001AAA"
            },
            sfdcLoginUrl: 'https://test.salesforce.com'
        };

        const packageJsonObj = {
            version: '0.0.0',
            salesforce: {
                packageVersionUrl: undefined
            }
        };

        const settings = {
            setUpInstallationLink: true
        };

        setUpInstallationLink(settings, sfdxProjectJson, packageJsonObj);

        expect(packageJsonObj.salesforce).not.toBeNull();
        expect(packageJsonObj.salesforce.packageVersionUrl).toBe('https://test.salesforce.com/packaging/installPackage.apexp?p0=04t000000000003AAA');
    });
});
