/* License: BSD
https://raw.githubusercontent.com/samiamlabs/dyno/master/LICENCE */

// @flow
import RosNodeJS from 'rosnodejs';
import PouchDB from 'pouchdb';
import math from 'mathjs';
import immutable from 'immutable';

PouchDB.plugin(require('pouchdb-adapter-memory'));

class PouchWorldState {
  nh: Object;
  chatterPub: Object;

  constructor(nh) {
    this.nh = nh;

    this.robotName = 'dyno';
    this.robotType = 'quadrotor';

    this.predicates = immutable.fromJS({
      robotsAtLocations: []
    });

    this.locationDB = new PouchDB('locations', {adapter: 'memory'});
    this.objectDB = new PouchDB('objects', {adapter: 'memory'});
    this.robotDB = new PouchDB('robots', {adapter: 'memory'});

    this.initLocationServices();
    this.initObjectServices();
    this.initRobotServices();
    this.initPredicateServices();

    this.initPublishers();
    this.initSubscribers();

  }

  initPublishers = () => {
    this.locationPublisher = this.nh.advertise('/world_state/locations', 'dyno_msgs/LocationArray');
    setInterval(() => {
      this.publishLocations()
    }, 100);

    this.objectPublisher = this.nh.advertise('/world_state/objects', 'dyno_msgs/ObjectArray');
    setInterval(() => {
      this.publishObjects()
    }, 100);

    this.robotPublisher = this.nh.advertise('/world_state/robots', 'dyno_msgs/RobotArray');
    setInterval(() => {
      this.publishRobots()
    }, 100);

    this.eventPublisher = this.nh.advertise('/world_state/event', 'dyno_msgs/WorldStateEvent');
  }

  publishEvent = (type : string) => {
    this.eventPublisher.publish({type})
  }

  initSubscribers = () => {
    this.robotPoseSubscriber = this.nh.subscribe('/robot_pose', 'geometry_msgs/PoseStamped', this.robotPoseCallback);
  }

  robotPoseCallback = async (robotPoseStamped) => {
    try {
      const fetchResult = await this.robotDB.allDocs({include_docs: true, attachments: true});
      const robots = [];
      fetchResult.rows.forEach(row => {
        const {name, _id, _rev} = row.doc;
        if (name === this.robotName) {
          row.doc.pose = robotPoseStamped.pose;
          robots.push(row.doc);
        }
      });

      if (robots.length === 0) {
        const robot = {name: this.robotName, type: this.robotType, pose: robotPoseStamped.pose};
        robots.push(robot);
      }

      const updateResult = await this.robotDB.bulkDocs(robots);
      this.publishEvent('robots');
      this.updatePredicates();

    } catch (err) {
      console.log(err);
    }
  }

  publishLocations = async () => {
    const locations = [];
    try {
      const result = await this.locationDB.allDocs({include_docs: true, attachments: true});
      result.rows.forEach(row => {
        locations.push(row.doc);
      });

    } catch (err) {
      console.log(err);
    }

    const locationsMsg = {
      locations
    }
    this.locationPublisher.publish(locationsMsg);
  }

  publishObjects = async () => {
    const objects = [];
    try {
      const result = await this.objectDB.allDocs({include_docs: true, attachments: true});
      result.rows.forEach(row => {
        objects.push(row.doc);
      });

    } catch (err) {
      console.log(err);
    }

    const objectsMsg = {
      objects
    }
    this.objectPublisher.publish(objectsMsg);
  }

  publishRobots = async () => {
    const robots = [];
    try {
      const result = await this.robotDB.allDocs({include_docs: true, attachments: true});
      result.rows.forEach(row => {
        robots.push(row.doc);
      });
    } catch (err) {
      console.log(err);
    }

    const robotsMsg = {
      robots
    }
    this.robotPublisher.publish(robotsMsg);
  }

  // Locations
  initLocationServices = () => {
    const clearLocationsService = this.nh.advertiseService('/world_state/clear_locations', 'std_srvs/Empty', async (reqest, response) => {
      this.clearLocations();
      return true;
    });

    const setLocationsService = this.nh.advertiseService('/world_state/set_locations', 'dyno_msgs/SetLocations', async (reqest, response) => {
      await this.setLocations(reqest.locations);
      return true;
    });

    const getLocationsService = this.nh.advertiseService('/world_state/get_locations', 'dyno_msgs/GetLocations', async (reqest, response) => {
      response.locations = await this.getLocations();
      return true;
    });
  }

  clearLocations = async () => {
    try {
      const result = await this.locationDB.destroy();
      this.locationDB = new PouchDB('locations', {adapter: 'memory'});
      console.log('Locations cleared');
    } catch (err) {
      console.log('Could not clear locations');
    }
  }

  setLocations = async (locations) => {
    try {
      const fetchResult = await this.locationDB.allDocs({include_docs: true, attachments: true});
      locations.forEach(location => {
        fetchResult.rows.forEach(row => {
          const {name, _id, _rev} = row.doc;
          if (name === location.name) {
            location._id = _id
            location._rev = _rev
          }
        });
      });

      const updateResult = await this.locationDB.bulkDocs(locations);
      this.publishEvent('locations');
      this.updatePredicates();

    } catch (err) {
      console.log(err);
    }
  }

  getLocations = async () => {
    const locations = [];
    try {
      const result = await this.locationDB.allDocs({include_docs: true, attachments: true});
      result.rows.forEach(row => {
        locations.push(row.doc);
      });

    } catch (err) {
      console.log(err);
    }
    return locations;
  }

  // Objects
  initObjectServices = () => {
    const clearObjectsService = this.nh.advertiseService('/world_state/clear_objects', 'std_srvs/Empty', async (reqest, response) => {
      this.clearObjects();
      return true;
    });

    const setObjectsService = this.nh.advertiseService('/world_state/set_objects', 'dyno_msgs/SetObjects', async (reqest, response) => {
      await this.setObjects(reqest.objects);
      return true;
    });

    const getObjectsService = this.nh.advertiseService('/world_state/get_objects', 'dyno_msgs/GetObjects', async (reqest, response) => {
      response.objects = await this.getObjects();
      return true;
    });
  }

  clearObjects = async () => {
    try {
      const result = await this.objectDB.destroy();
      this.objectDB = new PouchDB('objects', {adapter: 'memory'});
      console.log('Objects cleared');
    } catch (err) {
      console.log('Could not clear objects');
    }
  }

  setObjects = async (objects) => {
    try {
      const fetchResult = await this.objectDB.allDocs({include_docs: true, attachments: true});
      objects.forEach(object => {
        fetchResult.rows.forEach(row => {
          const {name, _id, _rev} = row.doc;
          if (name === object.name) {
            object._id = _id
            object._rev = _rev
          }
        });
      });

      const updateResult = await this.objectDB.bulkDocs(objects);
      this.publishEvent('objects');
      this.updatePredicates();

    } catch (err) {
      console.log(err);
    }
  }

  getObjects = async () => {
    const objects = [];
    try {
      const result = await this.objectDB.allDocs({include_docs: true, attachments: true});
      result.rows.forEach(row => {
        objects.push(row.doc);
      });

    } catch (err) {
      console.log(err);
    }
    return objects;
  }

  // Robots
  initRobotServices = () => {
    const clearRobotsService = this.nh.advertiseService('/world_state/clear_robots', 'std_srvs/Empty', async (reqest, response) => {
      this.clearRobots();
      return true;
    });

    const setRobotsService = this.nh.advertiseService('/world_state/set_robots', 'dyno_msgs/SetRobots', async (reqest, response) => {
      await this.setRobots(reqest.robots);
      return true;
    });

    const getRobotsService = this.nh.advertiseService('/world_state/get_robots', 'dyno_msgs/GetRobots', async (reqest, response) => {
      response.robots = await this.getRobots();
      return true;
    });
  }

  clearRobots = async () => {
    try {
      const result = await this.robotDB.destroy();
      this.robotDB = new PouchDB('robots', {adapter: 'memory'});
      console.log('Robots cleared');
    } catch (err) {
      console.log('Could not clear robots');
    }
  }

  setRobots = async (robots) => {
    try {
      const fetchResult = await this.robotDB.allDocs({include_docs: true, attachments: true});
      robots.forEach(robot => {
        fetchResult.rows.forEach(row => {
          const {name, _id, _rev} = row.doc;
          if (name === robot.name) {
            robot._id = _id
            robot._rev = _rev
          }
        });
      });

      const updateResult = await this.robotDB.bulkDocs(robots);
      this.publishEvent('robots');
      this.updatePredicates();

    } catch (err) {
      console.log(err);
    }
  }

  getRobots = async () => {
    const robots = [];
    try {
      const result = await this.robotDB.allDocs({include_docs: true, attachments: true});
      result.rows.forEach(row => {
        robots.push(row.doc);
      });

    } catch (err) {
      console.log(err);
    }
    return robots;
  }

  // Predicates
  initPredicateServices = () => {
    const getRobotsAtLocationsService = this.nh.advertiseService('/world_state/get_robots_at_locations', 'dyno_msgs/GetRobotsAtLocations', async (reqest, response) => {
      response.robots_at_locations = await this.getRobotsAtLocations()
      return true;
    });

    const getObjectsAtLocationsService = this.nh.advertiseService('/world_state/get_objects_at_locations', 'dyno_msgs/GetObjectsAtLocations', async (reqest, response) => {
      response.objects_at_locations = await this.getObjectsAtLocations()
      return true;
    });
  }

  updatePredicates = async () => {
    await this.updateRobotsAtLocations()
    await this.updateObjectsAtLocations()
  }

  getRobotsAtLocations = async () => {
    try {
      await this.updateRobotsAtLocations();
    } catch (err) {
      console.log(err);
    }
    return this.predicates.get('robotsAtLocations').toJS();
  }

  updateRobotsAtLocations = async () => {
    const robots = [];
    const locations = [];
    const robotsAtLocations = [];

    const atLocationCutoffDistance = 0.2;

    try {
      const robotResult = await this.robotDB.allDocs({include_docs: true, attachments: true});
      robotResult.rows.forEach(row => {
        robots.push(row.doc);
      });

      const locationResult = await this.locationDB.allDocs({include_docs: true, attachments: true});
      locationResult.rows.forEach(row => {
        locations.push(row.doc);
      });

    } catch (err) {
      console.log(err);
    }

    robots.forEach( robot => {
        locations.forEach( location => {
          const robotPoint2d = [robot.pose.position.x, robot.pose.position.y];
          const locationPoint2d = [location.pose.position.x, location.pose.position.y];
          if (math.distance(robotPoint2d, locationPoint2d) < atLocationCutoffDistance) {
            robotsAtLocations.push({robot_name: robot.name, location_name: location.name});
          }
        });
    });


    const updatedPredicates = this.predicates.set('robotsAtLocations', immutable.fromJS(robotsAtLocations));
    if (updatedPredicates !== this.predicates) {
        this.publishEvent('robots_at_locations');
    }
    this.predicates = updatedPredicates;
  }

  getObjectsAtLocations = async () => {
    try {
      await this.updateObjectsAtLocations();
    } catch (err) {
      console.log(err);
    }
    return this.predicates.get('objectsAtLocations').toJS();
  }

  updateObjectsAtLocations = async () => {
    const objects = [];
    const locations = [];
    const objectsAtLocations = [];

    const atLocationCutoffDistance = 0.2;

    try {
      const objectResult = await this.objectDB.allDocs({include_docs: true, attachments: true});
      objectResult.rows.forEach(row => {
        objects.push(row.doc);
      });

      const locationResult = await this.locationDB.allDocs({include_docs: true, attachments: true});
      locationResult.rows.forEach(row => {
        locations.push(row.doc);
      });

    } catch (err) {
      console.log(err);
    }

    objects.forEach( object => {
        locations.forEach( location => {
          const objectPoint2d = [object.pose.position.x, object.pose.position.y];
          const locationPoint2d = [location.pose.position.x, location.pose.position.y];
          if (math.distance(objectPoint2d, locationPoint2d) < atLocationCutoffDistance) {
            objectsAtLocations.push({object_name: object.name, location_name: location.name});
          }
        });
    });


    const updatedPredicates = this.predicates.set('objectsAtLocations', immutable.fromJS(objectsAtLocations));
    if (updatedPredicates !== this.predicates) {
        this.publishEvent('objects_at_locations');
    }
    this.predicates = updatedPredicates;
  }

}

RosNodeJS.initNode('/world_state').then(() => {
  const nh = RosNodeJS.nh;
  const pouchWorldState = new PouchWorldState(nh);
});
