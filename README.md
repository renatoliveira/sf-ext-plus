# Salesforce Extension Plus

The extension provides some tools to enhance the Salesforce development experience in Visual Studio Code. It is a collection of useful features that can help developers work more efficiently with Salesforce projects and that are not included in the official Salesforce Extension pack.

As of 2025-04-16 the extension is in not in beta, but is still limited in functionality. Some features should be added in the future, but for now it centers on providing some assistance for working with custom labels in an Salesforce project workspace.

## Features

### Use labels from your custom label files

Autocomplete is enabled for labels in Apex (`.cls`) files. Whenever you type `Label.` you'll see a list of labels available according to the custom label metadata files in your project's directory.

This feature is useful for developers who want to quickly access and use custom labels in their Apex code without having to manually type out the label names.

### View custom label information on hover

When you hover over a custom label in your Apex code, you'll see a tooltip that provides information about the label, including its name and value. This feature is useful for developers who want to quickly reference the details of a custom label without having to navigate to the custom label metadata file.

### Create custom labels from the command palette

You can create custom labels directly from the command palette. This feature allows you to quickly add new custom labels to your project without having to manually edit the metadata file or use the UI in Salesforce.

The command to create a custom label is `Salesforce Ext. Plus: Create Custom Label`. When you run this command, you'll be prompted to enter the label name and value. The extension will then create a new custom label metadata file with the specified name and value.


## Planned features

- Support for custom labels in Lightning Web Components (LWC) and Visualforce.
- Support for common custom field operations, such as creating, updating, and deleting custom fields.
  - Support for creating custom fields with specific attributes, such as required, unique, and external ID without having to open the Salesforce org's UI.
  - Automatically include the custom field in one or more permission sets (profiles will not supported because Salesforce is planing to somewhat "retire" them).
  - Support for modifying custom field types without having to delete and recreate the field.
- Flow support
  - Find and replace in Flow variables.
  - Find where a certain type, sobject or record type is used within a flow
