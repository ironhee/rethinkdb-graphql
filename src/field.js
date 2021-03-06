import _ from 'lodash';
import assert from 'assert';
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList,
  GraphQLEnumType,
} from 'graphql';
import {
  globalIdField,
} from 'graphql-relay';
import {
  GraphQLJoiType,
  GraphQLDateType,
} from './type';


function isJoi(schema) {
  return _.has(schema, 'isJoi');
}

function isJoiCollection(schema) {
  return _.isObject(schema) && !isJoi(schema);
}

export function getGraphQLFieldsFromTable(table) {
  const schema = table.getSchema();

  return {
    ...getGraphQLfieldsFromSchema(_.omit(schema, table.pk)),
    [table.pk]: globalIdField(table.tableName),
  };
}

export function getGraphQLfieldsFromSchema(schema, key) {
  if (isJoiCollection(schema)) {
    return _.mapValues(schema, (fieldSchema, fieldKey) => getGraphQLfieldsFromSchema(fieldSchema, fieldKey));
  }

  let GraphQLType;
  const {
    _type: type,
    _description: description,
    _flags: flags,
    _tests: tests,
    _inner: inner,
    _valids: valids,
    _meta: meta,
    _unit: unit,
  } = schema;

  const { GraphQLField, GraphQLType: metaGraphQLType } =
    _.reduce(meta, (result, value) => _.assignIn(result, value), {});

  if (!_.isUndefined(GraphQLField)) return GraphQLField;

  switch (type) {
  case 'object':
    const name = unit || key;
    assert.equal(_.isEmpty(name), false, 'object must provide by key or joi.unit()');
    GraphQLType = new GraphQLObjectType({
      name,
      fields: _.reduce(inner.children, (memo, child) => {
        return { ...memo, [child.key]: getGraphQLfieldsFromSchema(child.schema, child.key) };
      }, {}),
    });
    break;
  case 'array':
    assert.equal(inner.items.length, 1, 'array shoud only have one type');
    const { type: InnerGraphQLType } = getGraphQLfieldsFromSchema(inner.items[0]);
    GraphQLType = new GraphQLList(InnerGraphQLType);
    break;
  case 'boolean':
    GraphQLType = GraphQLBoolean;
    break;
  case 'number':
    GraphQLType = _.find(tests, { name: 'integer' }) ? GraphQLInt : GraphQLFloat;
    break;
  case 'date':
    GraphQLType = GraphQLDateType;
    break;
  case 'string':
  default:
    GraphQLType = GraphQLString;
    break;
  }

  if (flags.allowOnly) {
    assert.equal(_.isEmpty(valids._set), false, 'enum should have at least 1 item.');
    GraphQLType = new GraphQLEnumType({
      name: key,
      values: _.reduce(valids._set, (result, value) => {
        result[value] = {
          value: value,
        };
        return result;
      }, {}),
    });
  }

  if (!_.isUndefined(metaGraphQLType)) {
    GraphQLType = metaGraphQLType;
  }

  if (flags.presence === 'required') {
    GraphQLType = new GraphQLNonNull(GraphQLType);
  }

  return _.omitBy({ type: GraphQLType, description }, _.isEmpty);
}


export function joiToGraphQLJoiType(schema, name) {
  if (isJoiCollection(schema)) {
    return _.mapValues(schema, (fieldSchema, fieldKey) => joiToGraphQLJoiType(fieldSchema, fieldKey));
  }

  const graphQLJoiType = new GraphQLJoiType({ name, schema });

  return graphQLJoiType.schema;
}
